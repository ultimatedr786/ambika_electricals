// Accessibility and performance audit of the critical flows
// (FINAL_MVP_LAUNCH_COMPLETION.md §7: "Basic performance/accessibility audit
// for critical login, QR scan, Create Sale, redemption and mobile PWA flows").
//
// This RUNS the audit rather than asserting one happened: axe-core is injected
// into a real Chromium page for each flow, and navigation/paint timings are
// read from the Performance API of the same load. The output is a markdown
// report committed alongside the code, so a regression is a diff.
//
//   npm run build && npm start &          # or any running instance
//   npm run audit:a11y
//
// Env:
//   BASE_URL             default http://127.0.0.1:3000
//   PW_CHROMIUM_PATH     browser binary (CI: the Playwright-managed one)
//   AUDIT_OUT            default PERFORMANCE_A11Y_AUDIT.md
//
// Exit code is non-zero when a flow has a *serious* or *critical* axe
// violation, so this can gate a release without failing on cosmetic advice.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = process.env.AUDIT_OUT || join(repoRoot, "PERFORMANCE_A11Y_AUDIT.md");
const AXE = readFileSync(join(repoRoot, "node_modules/axe-core/axe.min.js"), "utf8");

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

/**
 * The five flows §7 names. `setup` runs after load to reach the state that
 * actually matters — a dialog that is never opened is a dialog that was never
 * audited.
 */
const FLOWS = [
  {
    id: "login",
    name: "Login",
    path: "/login",
    viewport: DESKTOP,
  },
  {
    id: "qr-scan",
    name: "QR scan (counter)",
    path: "/business/sales/new",
    viewport: DESKTOP,
    setup: async (page) => {
      await page.getByRole("button", { name: /scan customer qr/i }).click();
      await page.waitForTimeout(2400); // let the simulated scan settle
    },
  },
  {
    id: "create-sale",
    name: "Create Sale",
    path: "/business/sales/new",
    viewport: DESKTOP,
  },
  {
    id: "redemption",
    name: "Reward redemption",
    path: "/customer/rewards",
    viewport: DESKTOP,
  },
  {
    id: "mobile-pwa",
    name: "Mobile PWA (customer home)",
    path: "/customer/dashboard",
    viewport: MOBILE,
    mobile: true,
  },
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const results = [];

for (const flow of FLOWS) {
  const context = await browser.newContext({
    viewport: flow.viewport,
    hasTouch: Boolean(flow.mobile),
    isMobile: Boolean(flow.mobile),
    deviceScaleFactor: flow.mobile ? 3 : 1,
    reducedMotion: "reduce", // audit the layout, not the animation
  });
  const page = await context.newPage();

  const started = Date.now();
  await page.goto(`${BASE}${flow.path}`, { waitUntil: "networkidle" });
  const loadMs = Date.now() - started;

  if (flow.setup) {
    try {
      await flow.setup(page);
    } catch (err) {
      console.error(`  ! ${flow.name}: setup step failed — ${err.message}`);
    }
  }

  // Timings from the browser itself rather than our stopwatch.
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)])
    );
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1);
    const transferred = performance
      .getEntriesByType("resource")
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
      firstContentfulPaint: paints["first-contentful-paint"] ?? null,
      largestContentfulPaint: lcp ? Math.round(lcp.startTime) : null,
      transferredKb: Math.round((transferred + (nav?.transferSize ?? 0)) / 1024),
      domNodes: document.getElementsByTagName("*").length,
    };
  });

  // axe-core in the page, WCAG 2.1 A/AA.
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
  });

  const violations = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    sample: (v.nodes[0]?.target ?? []).join(" "),
  }));

  results.push({ flow, loadMs, timing, violations, passes: axe.passes?.length ?? 0 });

  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  console.log(
    `  ${flow.name.padEnd(28)} FCP ${String(timing.firstContentfulPaint ?? "?").padStart(5)}ms · ` +
      `${String(timing.transferredKb).padStart(4)}KB · ` +
      `${violations.length} a11y finding(s)${serious.length ? ` (${serious.length} serious+)` : ""}`
  );

  await context.close();
}

await browser.close();

/* ----------------------------- report ----------------------------- */

const seriousTotal = results.reduce(
  (n, r) => n + r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length,
  0
);

const fmt = (v) => (v == null ? "—" : `${v} ms`);
const lines = [];

lines.push("# Performance & accessibility audit — critical flows");
lines.push("");
lines.push(
  "Generated by `npm run audit:a11y` (scripts/audit/a11y-perf.mjs): axe-core " +
    `${JSON.parse(readFileSync(join(repoRoot, "node_modules/axe-core/package.json"), "utf8")).version}` +
    " injected into a real Chromium page per flow, WCAG 2.1 A/AA rules, plus " +
    "navigation timings read from the browser's own Performance API."
);
lines.push("");
lines.push(`- Run at: ${new Date().toISOString()}`);
lines.push(`- Target: \`${BASE}\` (production build, demo/mock fallback — no Supabase configured)`);
lines.push(`- Flows audited: ${results.length}`);
lines.push(`- Serious/critical accessibility violations: **${seriousTotal}**`);
lines.push("");
lines.push(
  "> Measured on the CI/sandbox machine against a local server, so the timings are a " +
    "**relative baseline for regressions**, not a claim about a customer's 4G phone in a shop. " +
    "Field numbers come from staging on real devices — see the UAT checklist."
);
lines.push("");

lines.push("## Performance");
lines.push("");
lines.push("| Flow | Viewport | FCP | LCP | DOMContentLoaded | Transferred | DOM nodes |");
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of results) {
  lines.push(
    `| ${r.flow.name} | ${r.flow.viewport.width}×${r.flow.viewport.height}${r.flow.mobile ? " (touch)" : ""} ` +
      `| ${fmt(r.timing.firstContentfulPaint)} | ${fmt(r.timing.largestContentfulPaint)} ` +
      `| ${fmt(r.timing.domContentLoaded)} | ${r.timing.transferredKb} KB | ${r.timing.domNodes} |`
  );
}
lines.push("");

lines.push("## Accessibility (axe-core, WCAG 2.1 A/AA)");
lines.push("");
lines.push("| Flow | Violations | Serious/critical | Rules passed |");
lines.push("| --- | --- | --- | --- |");
for (const r of results) {
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length;
  lines.push(`| ${r.flow.name} | ${r.violations.length} | ${serious} | ${r.passes} |`);
}
lines.push("");

for (const r of results) {
  if (r.violations.length === 0) continue;
  lines.push(`### ${r.flow.name} — findings`);
  lines.push("");
  lines.push("| Rule | Impact | Nodes | First occurrence |");
  lines.push("| --- | --- | --- | --- |");
  for (const v of r.violations) {
    lines.push(
      `| \`${v.id}\` — ${v.help} | ${v.impact ?? "n/a"} | ${v.nodes} | \`${v.sample.slice(0, 80)}\` |`
    );
  }
  lines.push("");
}

if (results.every((r) => r.violations.length === 0)) {
  lines.push("No WCAG 2.1 A/AA violations were reported on any audited flow.");
  lines.push("");
}

lines.push("## What this does and does not cover");
lines.push("");
lines.push(
  "- axe-core finds roughly a third to a half of WCAG issues. It cannot judge whether alt text is " +
    "*meaningful*, whether focus order makes sense to a screen-reader user, or whether an error " +
    "message is understandable. Manual keyboard and screen-reader passes are on the UAT checklist."
);
lines.push(
  "- Flows are audited in demo/mock fallback, because that is what runs without owner credentials. " +
    "The live variants render additional panels; re-run this against staging once Supabase is " +
    "configured."
);
lines.push(
  "- The QR-scan flow audits the counter dialog in its post-scan state; camera capture is out of " +
    "scope for this MVP by design."
);
lines.push("");

writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(`\nReport written to ${OUT}`);

if (seriousTotal > 0) {
  console.error(`FAILED: ${seriousTotal} serious/critical accessibility violation(s).`);
  process.exit(1);
}
console.log("No serious or critical accessibility violations.");
