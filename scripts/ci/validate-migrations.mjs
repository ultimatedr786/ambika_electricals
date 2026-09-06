// Migration and schema validation.
//
// Applies every migration, in filename order, to a freshly created database
// and then asserts a handful of invariants that a syntactically valid but
// semantically broken migration set would still violate.
//
// This runs BEFORE the test suites in CI: if the schema cannot be built from
// scratch, nothing downstream is worth reading. It is also what catches the
// class of bug that only appears on a brand-new environment — an ordering
// mistake, a missing dependency, a function referencing a column added later.
//
//   PGHOST=127.0.0.1 PGPORT=5432 node scripts/ci/validate-migrations.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const TEST_DB = process.env.VALIDATE_DB_NAME || "migration_validation";

const PG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: process.env.PGPORT || "54329",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};
const urlFor = (db) =>
  `postgres://${PG.user}:${encodeURIComponent(PG.password)}@${PG.host}:${PG.port}/${db}`;

async function withClient(db, fn) {
  const client = new pg.Client({ connectionString: urlFor(db) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

// ---------------------------------------------------------------------------
// 1. Filenames must sort into the intended order.
// ---------------------------------------------------------------------------
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error("No migrations found — refusing to validate an empty schema.");
  process.exit(1);
}
for (const f of files) {
  check(
    /^\d{14}_[a-z0-9_]+\.sql$/.test(f),
    `migration "${f}" does not match <14-digit timestamp>_<snake_case>.sql`
  );
}
const timestamps = files.map((f) => f.slice(0, 14));
check(
  new Set(timestamps).size === timestamps.length,
  "two migrations share a timestamp — their apply order is undefined"
);

console.log(`Validating ${files.length} migration(s) against ${PG.host}:${PG.port}`);

// ---------------------------------------------------------------------------
// 2. Build the schema from nothing.
// ---------------------------------------------------------------------------
await withClient("postgres", async (c) => {
  await c.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${TEST_DB}`);
});

await withClient(TEST_DB, async (c) => {
  // Supabase provides `auth.uid()` and the API roles at runtime; the harness
  // stubs supply them so migrations can be applied outside a Supabase project.
  await c.query(readFileSync(join(repoRoot, "scripts/rls-check/00_stubs.sql"), "utf8"));

  for (const f of files) {
    const started = Date.now();
    try {
      await c.query(readFileSync(join(migrationsDir, f), "utf8"));
    } catch (err) {
      console.error(`\nFAILED applying ${f}\n  ${err.message}`);
      if (err.where) console.error(`  at: ${String(err.where).split("\n")[0]}`);
      process.exit(1);
    }
    console.log(`  applied ${f} (${Date.now() - started}ms)`);
  }

  // Seed must also load: it is the fixture every suite builds on, and a schema
  // change that breaks it breaks local development for everyone.
  try {
    await c.query(readFileSync(join(repoRoot, "supabase/seed.sql"), "utf8"));
  } catch (err) {
    console.error(`\nFAILED applying seed.sql\n  ${err.message}`);
    process.exit(1);
  }
  console.log("  applied seed.sql");

  // -------------------------------------------------------------------------
  // 3. Invariants that must hold for EVERY table we own.
  // -------------------------------------------------------------------------
  const { rows: tables } = await c.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  `);

  for (const t of tables) {
    check(t.rls_enabled, `table public.${t.table_name} does not have row level security enabled`);
  }

  // Nothing in the API roles should be able to write without going through an
  // RPC, except the few places we deliberately allow direct DML.
  const ALLOWED_DIRECT_WRITE = new Set([
    "profiles",              // own row, column-limited UPDATE grant
    "customer_memberships",  // staff enrolment at the counter
  ]);
  const { rows: writable } = await c.query(`
    select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     group by table_name
     order by table_name
  `);
  for (const w of writable) {
    check(
      ALLOWED_DIRECT_WRITE.has(w.table_name),
      `public.${w.table_name} grants ${w.privs} to an API role — writes should go through an RPC`
    );
  }

  // `anon` must never reach application data.
  const { rows: anonGrants } = await c.query(`
    select table_name from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon'
     order by table_name
  `);
  check(
    anonGrants.length === 0,
    `anon has table grants: ${anonGrants.map((r) => r.table_name).join(", ")}`
  );

  // Trigger functions can never be usefully called directly (PostgreSQL
  // raises 0A000), but PUBLIC gets EXECUTE on every new function by default.
  // Leaving them callable is harmless surface, and harmless surface is how
  // surface accumulates — so it is a build failure, not a style note.
  const { rows: triggerFns } = await c.query(`
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'pg_catalog.trigger'::regtype
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('anon', p.oid, 'EXECUTE'))
     order by p.proname
  `);
  for (const t of triggerFns) {
    check(false, `trigger function public.${t.proname} is EXECUTE-able by an API role`);
  }

  // Every SECURITY DEFINER function must pin its search_path, or it can be
  // hijacked by a caller-controlled schema.
  const { rows: definers } = await c.query(`
    select p.proname, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
     order by p.proname
  `);
  for (const d of definers) {
    const cfg = (d.proconfig ?? []).join(" ");
    check(
      cfg.includes("search_path="),
      `SECURITY DEFINER function public.${d.proname} does not set search_path`
    );
  }
  console.log(
    `  checked ${tables.length} tables, ${definers.length} definer functions ` +
      `and every trigger function's grants`
  );
});

await withClient("postgres", (c) => c.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));

if (problems.length > 0) {
  console.error(`\nSchema validation FAILED — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log("\nSchema validation passed.");
