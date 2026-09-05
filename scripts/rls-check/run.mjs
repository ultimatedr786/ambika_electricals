#!/usr/bin/env node
/**
 * RLS check runner — Phase 2 Step 2 Stage D proof.
 *
 * Applies scripts/rls-check/00_stubs.sql → supabase/migrations/* → supabase/seed.sql
 * to a THROWAWAY database on any PostgreSQL server, then executes every
 * `-- CASE:` block of scripts/rls-check/10_assertions.sql in its own
 * transaction and reports pass/fail.
 *
 * Usage:
 *   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGPASSWORD=postgres node scripts/rls-check/run.mjs
 * (or set DATABASE_URL to the server's admin database)
 *
 * Requires superuser-ish rights on the target server (creates roles/db in the
 * stub step) — intended for CI containers and local dev, never for hosted
 * projects (there, use `supabase test db` with supabase/tests/*).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const ADMIN_URL =
  process.env.DATABASE_URL ||
  `postgres://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgres"}@${
    process.env.PGHOST || "127.0.0.1"
  }:${process.env.PGPORT || 54329}/${process.env.PGDATABASE || "postgres"}`;
const TEST_DB = process.env.RLS_DB_NAME || "rewardly_test";

function adminUrlFor(db) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

async function query(url, sql, params) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

console.log(`RLS check · server ${ADMIN_URL.replace(/:[^:@/]+@/, ":***@")} · throwaway db "${TEST_DB}"`);

// 1. Fresh database every run (seed.sql refuses non-empty databases anyway).
await query(adminUrlFor("postgres"), `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
await query(adminUrlFor("postgres"), `CREATE DATABASE ${TEST_DB}`);
const testUrl = adminUrlFor(TEST_DB);

// 2. Stubs → migrations → seed
const sqlFiles = [
  { label: "stubs", file: join(here, "00_stubs.sql") },
  ...readdirSync(join(repoRoot, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ label: f, file: join(repoRoot, "supabase", "migrations", f) })),
  { label: "seed.sql", file: join(repoRoot, "supabase", "seed.sql") },
];

for (const { label, file } of sqlFiles) {
  const sql = readFileSync(file, "utf8");
  const t0 = Date.now();
  await query(testUrl, sql);
  console.log(`APPLIED ${label} (${Date.now() - t0}ms)`);
}

// 3. Assertion cases — each in its own transaction.
const suite = readFileSync(join(here, "10_assertions.sql"), "utf8");
const parts = suite.split(/^-- CASE:\s*/m).slice(1);
let passed = 0;
const failures = [];

for (const part of parts) {
  const nl = part.indexOf("\n");
  const label = part.slice(0, nl).trim();
  const sql = part.slice(nl + 1);
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    passed++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const detail = [err.message.split("\n")[0], err.where ? `WHERE: ${err.where.split("\n")[0]}` : ""]
      .filter(Boolean)
      .join(" | ");
    failures.push({ label, message: detail });
    console.error(`FAIL  ${label}\n      ${detail}`);
  } finally {
    await client.end();
  }
}

console.log(`\n${passed}/${parts.length} RLS cases passed.`);
if (failures.length) {
  console.error("Failures:");
  for (const f of failures) console.error(`  - ${f.label}: ${f.message}`);
  process.exit(1);
}
process.exit(0);
