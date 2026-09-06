// Repository secret scan.
//
// Deliberately self-contained: no network, no third-party action, no licence
// gate — so it runs identically on a laptop and in CI, and a fork cannot be
// silently skipped. It is a floor, not a replacement for GitHub's own secret
// scanning and push protection, which the owner should also enable (see
// OPERATIONS.md §Secret management).
//
//   npm run scan:secrets              # working tree
//   npm run scan:secrets -- --staged  # only what is about to be committed
//
// Exits non-zero on the first finding, printing file:line and a REDACTED
// excerpt — the point is to stop the commit, never to reprint the secret.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stagedOnly = process.argv.includes("--staged");

/**
 * Patterns worth failing a build over. Each needs a `name` (what we found) and
 * a `re`. Keep these specific: a scanner that cries wolf gets disabled, which
 * is strictly worse than no scanner.
 */
const RULES = [
  {
    name: "Supabase service-role key (JWT with service_role)",
    // A JWT whose payload decodes to service_role — the key that bypasses RLS.
    re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    verify: (match) => {
      try {
        const payload = JSON.parse(
          Buffer.from(match.split(".")[1], "base64url").toString("utf8")
        );
        return payload?.role === "service_role" || payload?.role === "anon";
      } catch {
        return false;
      }
    },
  },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/g },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{24,}/g },
  { name: "Stripe secret key", re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/g },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  {
    name: "Hard-coded service-role assignment",
    re: /SERVICE_ROLE[_A-Z]*\s*[:=]\s*["'][^"'\s]{20,}["']/g,
  },
  {
    name: "Database URL with an inline password",
    re: /postgres(?:ql)?:\/\/[^:\s/]+:(?!postgres@|\*{3}|password@)[^@\s/]{8,}@/g,
  },
];

/** Never scanned: build output, dependencies, binaries, lockfiles. */
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "out", "coverage",
  ".tmp-testdb", "test-results", "playwright-report", "blob-report",
]);
const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico", ".pdf", ".zip",
  ".woff", ".woff2", ".ttf", ".mp3", ".mp4", ".wasm",
]);

/**
 * `.env.example` documents variable NAMES with placeholder values and must stay
 * scannable for real secrets — so it is checked, but obvious placeholders are
 * allowed everywhere.
 */
const PLACEHOLDER = /(your[-_ ]|example|placeholder|changeme|xxx+|<[^>]+>|\.{3}|redacted|dummy)/i;

/**
 * A template interpolation is code, not a credential:
 * `postgres://${user}:${encodeURIComponent(pw)}@host` matches the connection
 * -string rule but contains no secret. Skipping these keeps the scanner
 * believable, which is the only reason anyone leaves it switched on.
 */
const INTERPOLATED = /\$\{|\$\(|%s|\{\{/;

function listFiles() {
  if (stagedOnly) {
    const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  }
  const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

/** Show enough to locate the finding, never enough to use it. */
function redact(value) {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`;
}

const findings = [];

for (const rel of listFiles()) {
  const parts = rel.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) continue;
  if (SKIP_FILES.has(parts[parts.length - 1])) continue;
  if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;

  const abs = join(repoRoot, rel);
  let text;
  try {
    if (statSync(abs).size > 2_000_000) continue;
    text = readFileSync(abs, "utf8");
  } catch {
    continue; // deleted between listing and reading, or unreadable
  }
  if (text.includes("\u0000")) continue; // binary

  const lines = text.split("\n");
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const value = m[0];
      if (PLACEHOLDER.test(value) || INTERPOLATED.test(value)) continue;
      if (rule.verify && !rule.verify(value)) continue;

      const line = text.slice(0, m.index).split("\n").length;
      // An inline allow-list comment, for the rare deliberate case.
      if ((lines[line - 1] ?? "").includes("secret-scan-ignore")) continue;

      findings.push({ file: rel, line, rule: rule.name, excerpt: redact(value) });
    }
  }
}

if (findings.length > 0) {
  console.error(`\nSecret scan FAILED — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.rule}`);
    console.error(`    ${f.excerpt}   (redacted)`);
  }
  console.error(
    "\nIf a finding is a false positive, add a `secret-scan-ignore` comment on that line."
  );
  console.error(
    "If it is real: rotate the credential FIRST, then remove it from the file and from git history.\n"
  );
  process.exit(1);
}

console.log(`Secret scan passed — ${RULES.length} rules, no findings.`);
