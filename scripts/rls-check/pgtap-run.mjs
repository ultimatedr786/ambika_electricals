// Runner for supabase/tests/rls_policy_tests.sql.
//
// TWO MODES, and the difference matters:
//
//   PGTAP_REAL=1 → installs the REAL pgTAP extension and runs the file against
//                  it. This is what CI uses (see .github/workflows/ci.yml); it
//                  is the only mode that proves the file works with genuine
//                  pgTAP semantics rather than our approximation of them.
//
//   default      → substitutes minimal stubs for the pgTAP subset the file
//                  uses (plan/is/ok/matches/lives_ok/throws_ok/finish), so the
//                  suite can still run where pgTAP/Docker is unavailable.
//                  Stub semantics: is() compares ::text with IS NOT DISTINCT
//                  FROM; failures surface as `not ok N` WARNING lines; finish()
//                  raises when run<>plan or anything failed.
//
// Connection comes from PGHOST/PGPORT/PGUSER/PGPASSWORD (same as run.mjs), so
// the same script works against the local embedded server and a CI service
// container.
//
// Usage: node scripts/rls-check/pgtap-run.mjs
//        PGTAP_REAL=1 PGPORT=5432 node scripts/rls-check/pgtap-run.mjs
//
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REAL_PGTAP = process.env.PGTAP_REAL === "1";
const TEST_DB = process.env.RLS_DB_NAME || (REAL_PGTAP ? "pgtap_ci" : "pgtap_local");

const PG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: process.env.PGPORT || "54329",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};
const adminUrlFor = (db) =>
  `postgres://${PG.user}:${encodeURIComponent(PG.password)}@${PG.host}:${PG.port}/${db}`;

const ALL_NOTICES = [];
async function query(url, sql) {
  const client = new pg.Client({ connectionString: url });
  client.on("notice", (n) => ALL_NOTICES.push(n.message));
  await client.connect();
  try { return { res: await client.query(sql) }; }
  finally { await client.end(); }
}

await query(adminUrlFor("postgres"), `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
await query(adminUrlFor("postgres"), `CREATE DATABASE ${TEST_DB}`);
const testUrl = adminUrlFor(TEST_DB);

const files = [
  join(repoRoot, "scripts/rls-check/00_stubs.sql"),
  ...readdirSync(join(repoRoot, "supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()
      .map(f=>join(repoRoot,"supabase/migrations",f)),
  join(repoRoot, "supabase/seed.sql"),
];
for (const f of files) await query(testUrl, readFileSync(f, "utf8"));
console.log("APPLIED stubs + migrations + seed");

const STUBS = `
create or replace function extensions.plan(p_n integer) returns text language plpgsql as $$
begin
  perform set_config('tap.plan', p_n::text, true);
  perform set_config('tap.run', '0', true);
  perform set_config('tap.fail', '0', true);
  return '1..' || p_n;
end $$;
create or replace function extensions._tap_report(p_ok boolean, p_descr text, p_detail text default null)
returns text language plpgsql as $$
declare v_run int;
begin
  v_run := coalesce(current_setting('tap.run', true), '0')::int + 1;
  perform set_config('tap.run', v_run::text, true);
  if p_ok then
    raise notice 'ok % - %', v_run, p_descr;
    return 'ok';
  end if;
  perform set_config('tap.fail', (coalesce(current_setting('tap.fail', true), '0')::int + 1)::text, true);
  raise warning 'not ok % - % %', v_run, p_descr, coalesce('(' || p_detail || ')', '');
  return 'not ok';
end $$;
create or replace function extensions.is(a anyelement, b anyelement, descr text)
returns text language plpgsql as $$
begin
  if a::text is not distinct from b::text then
    return extensions._tap_report(true, descr);
  end if;
  return extensions._tap_report(false, descr, 'got [' || coalesce(a::text,'NULL') || '] expected [' || coalesce(b::text,'NULL') || ']');
end $$;
create or replace function extensions.ok(cond boolean, descr text)
returns text language plpgsql as $$
begin return extensions._tap_report(coalesce(cond,false), descr); end $$;
create or replace function extensions.matches(a text, p_regex text, descr text)
returns text language plpgsql as $$
begin
  if a ~ p_regex then
    return extensions._tap_report(true, descr);
  end if;
  return extensions._tap_report(false, descr,
    'got [' || coalesce(a, 'NULL') || '] does not match [' || p_regex || ']');
end $$;
create or replace function extensions.lives_ok(stmt text, descr text)
returns text language plpgsql as $$
begin
  execute stmt;
  return extensions._tap_report(true, descr);
exception when others then
  return extensions._tap_report(false, descr, 'died: ' || sqlerrm);
end $$;
create or replace function extensions.throws_ok(stmt text, p_sqlstate text, descr text)
returns text language plpgsql as $$
begin
  execute stmt;
  return extensions._tap_report(false, descr, 'no exception raised, expected ' || p_sqlstate);
exception when others then
  if sqlstate = p_sqlstate then return extensions._tap_report(true, descr); end if;
  return extensions._tap_report(false, descr, 'got sqlstate ' || sqlstate || ' expected ' || p_sqlstate);
end $$;
create or replace function extensions.throws_ok(stmt text, p_sqlstate text, p_errmsg text, descr text)
returns text language plpgsql as $$
begin
  execute stmt;
  return extensions._tap_report(false, descr, 'no exception raised, expected ' || p_sqlstate);
exception when others then
  if sqlstate <> p_sqlstate then
    return extensions._tap_report(false, descr, 'got sqlstate ' || sqlstate || ' expected ' || p_sqlstate);
  end if;
  if p_errmsg is not null and sqlerrm not like '%' || p_errmsg || '%' then
    return extensions._tap_report(false, descr, 'got message [' || sqlerrm || '] expected to contain [' || p_errmsg || ']');
  end if;
  return extensions._tap_report(true, descr);
end $$;
create or replace function extensions.finish() returns setof text language plpgsql as $$
declare v_run int := coalesce(current_setting('tap.run', true), '0')::int;
        v_fail int := coalesce(current_setting('tap.fail', true), '0')::int;
        v_plan int := coalesce(current_setting('tap.plan', true), '0')::int;
begin
  if v_fail > 0 or v_run <> v_plan then
    raise exception 'TAP FAILURE: run=% plan=% fail=%', v_run, v_plan, v_fail;
  end if;
  raise notice 'TAP finish: all % tests passed (plan %)', v_run, v_plan;
  return next 'done';
end $$;
`;

let tap = readFileSync(join(repoRoot, "supabase/tests/rls_policy_tests.sql"), "utf8");
const createExt = "create extension if not exists pgtap with schema extensions;";
if (!tap.includes(createExt)) throw new Error("create-extension line not found");
if (!REAL_PGTAP) {
  tap = tap.replace(createExt, () => STUBS); // fn form: $$ must not be unescaped
}

const mode = REAL_PGTAP ? "REAL pgTAP" : "stub";

try {
  const { res } = await query(testUrl, tap);
  if (REAL_PGTAP) {
    // Real pgTAP returns TAP lines as rows; a failure is any line starting
    // "not ok". finish() does not raise, so we inspect the output ourselves.
    const sets = Array.isArray(res) ? res : [res];
    const lines = sets.flatMap((r) => (r?.rows ?? []).map((row) => Object.values(row)[0]));
    const failures = lines.filter((l) => typeof l === "string" && l.startsWith("not ok"));
    const oks = lines.filter((l) => typeof l === "string" && /^ok \d+/.test(l)).length;
    for (const f of failures) console.error(f);
    if (failures.length > 0) {
      console.error(`\npgTAP ${mode} run: ${oks} ok, ${failures.length} not ok — FAILED`);
      process.exit(1);
    }
    console.log(`\npgTAP ${mode} run: ${oks} ok, 0 not ok — PASSED`);
    process.exit(0);
  }
  const oks = ALL_NOTICES.filter(n => /^ok \d+/.test(n)).length;
  console.log(`\npgTAP ${mode} run: ${oks} ok, 0 not ok — PASSED`);
  process.exit(0);
} catch (err) {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  const q = async (sql) => (await client.query(sql)).rows;
  // rerun capturing warnings for detail: replay is not possible; rely on err + first pass notices
  console.error(`\npgTAP ${mode} run FAILED:`, err.message.split("\n")[0]);
  for (const n of ALL_NOTICES.filter(m => m.startsWith("not ok"))) console.error(n);
  if (err.where) console.error("WHERE:", err.where.split("\n").slice(0,3).join(" | "));
  if (err.position) {
    const pos = Number(err.position);
    console.error("CONTEXT near position:", JSON.stringify(tap.slice(Math.max(0,pos-200), pos+120)));
  }
  await client.end();
  process.exit(1);
}
