#!/usr/bin/env node
/**
 * Route smoke test — Phase 2 Step 2 verification helper.
 *
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-routes.mjs
 *
 * Fetches every Phase 1 route plus the Phase 2 auth routes and asserts the
 * expected HTTP status and (where useful) a content marker. Exits non-zero on
 * the first failure so it can gate CI.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

/** @type {{path: string, status?: number, marker?: string, label: string}[]} */
const routes = [
  // Marketing / entry
  { path: "/", status: 307, label: "Landing page (redirects to /login by design)" },
  { path: "/offline", label: "PWA offline screen" },
  { path: "/manifest.webmanifest", label: "PWA manifest", marker: "Ambika" },
  { path: "/sw.js", label: "Service worker" },
  { path: "/icon.svg", label: "App icon" },

  // Auth (Phase 1 UI, Phase 2 real flows)
  { path: "/login", label: "Login", marker: "Welcome back" },
  { path: "/signup", label: "Customer signup", marker: "Start earning rewards" },
  { path: "/forgot-password", label: "Forgot password", marker: "Reset your password" },
  { path: "/reset-password", label: "Reset password (new)", marker: "New password" },
  { path: "/business/signup", label: "Business signup", marker: "Set up rewards" },
  { path: "/onboarding", label: "Onboarding" },

  // Customer journey (Phase 1, must not regress)
  { path: "/customer/dashboard", label: "Customer dashboard" },
  { path: "/customer/rewards", label: "Rewards store" },
  { path: "/customer/rewards/r-001", label: "Reward detail (dynamic)" },
  { path: "/customer/rewards/cart", label: "Reward cart" },
  { path: "/customer/rewards/checkout", label: "Reward checkout" },
  { path: "/customer/activity", label: "Activity" },
  { path: "/customer/challenges", label: "Challenges" },
  { path: "/customer/membership", label: "Membership card" },
  { path: "/customer/notifications", label: "Notifications" },
  { path: "/customer/profile", label: "Customer profile" },
  { path: "/customer/redemptions", label: "Redemptions" },
  { path: "/customer/referrals", label: "Referrals" },
  { path: "/customer/wishlist", label: "Wishlist" },

  // Business journey (Phase 1, must not regress)
  { path: "/business/dashboard", label: "Business dashboard" },
  { path: "/business/analytics", label: "Analytics" },
  { path: "/business/sales", label: "Sales list" },
  { path: "/business/sales/new", label: "New sale (POS)" },
  { path: "/business/customers", label: "Customers list" },
  { path: "/business/customers/c-001", label: "Customer detail (dynamic)" },
  { path: "/business/products", label: "Products" },
  { path: "/business/rewards", label: "Business rewards" },
  { path: "/business/rules", label: "Reward rules" },
  { path: "/business/campaigns", label: "Campaigns" },
  { path: "/business/challenges", label: "Business challenges" },
  { path: "/business/stores", label: "Stores" },
  { path: "/business/staff", label: "Staff" },
  { path: "/business/settings", label: "Settings" },

  // Phase 2 auth endpoints
  { path: "/auth/invite/sample-token", label: "Invitation page", marker: "invitation" },
];

let failures = 0;
for (const route of routes) {
  const expected = route.status ?? 200;
  try {
    const res = await fetch(`${BASE}${route.path}`, { redirect: "manual" });
    const okStatus = res.status === expected;
    let okMarker = true;
    if (route.marker) {
      const body = await res.text();
      okMarker = body.toLowerCase().includes(route.marker.toLowerCase());
    }
    if (okStatus && okMarker) {
      console.log(`PASS  ${res.status}  ${route.path}  (${route.label})`);
    } else {
      failures++;
      console.error(
        `FAIL  ${res.status}  ${route.path}  (${route.label})` +
          (!okStatus ? ` expected status ${expected}` : "") +
          (!okMarker ? ` missing marker "${route.marker}"` : "")
      );
    }
  } catch (err) {
    failures++;
    console.error(`FAIL  ERR  ${route.path}  (${route.label}) — ${err.message}`);
  }
}

console.log(failures === 0 ? `\nAll ${routes.length} smoke checks passed.` : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
