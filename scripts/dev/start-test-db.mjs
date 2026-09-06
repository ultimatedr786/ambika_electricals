// Local test database bootstrap.
//
// CI uses a real PostgreSQL service container (see .github/workflows/ci.yml).
// Locally, `supabase start` needs Docker, which is not always available — this
// script gives the same thing without it: a throwaway PostgreSQL server that
// `npm run test:rls` and `scripts/rls-check/pgtap-run.mjs` can talk to.
//
//   npm run db:start     # starts on 127.0.0.1:54329 and stays in the foreground
//
// Keep it running in its own terminal: the server is a child process and dies
// with this script. The data directory lives outside the repository
// (`.tmp-testdb/` at the repo root, git-ignored) and can be deleted at any
// time — every suite recreates its own throwaway database anyway.
import EmbeddedPostgres from "embedded-postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = process.env.TEST_DB_DIR || resolve(repoRoot, ".tmp-testdb/data");
const port = Number(process.env.PGPORT || 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
});

try {
  await pg.initialise();
  console.log(`initialised a fresh cluster at ${dataDir}`);
} catch (err) {
  // Re-running against an existing cluster is the normal case; initdb refuses
  // a non-empty directory and that is fine.
  if (!/not empty/i.test(String(err?.message ?? err))) throw err;
  console.log(`reusing the existing cluster at ${dataDir}`);
}

await pg.start();
console.log(`test database ready on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log("run `npm run test:rls` in another terminal · Ctrl-C here to stop");

const stop = async () => {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Park forever; the server dies with this process.
await new Promise(() => {});
