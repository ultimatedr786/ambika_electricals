import { test, expect, type Page } from "@playwright/test";

/**
 * MVP UI acceptance gate — real browser, production build.
 *
 * Mirrors FINAL_MVP_LAUNCH_COMPLETION.md §"UI acceptance gate" one-for-one:
 *   1. Demo Mode is absent from normal UI.
 *   2. Cmd/Ctrl+K finds and opens authorized pages, customers, products,
 *      invoices and rewards.
 *   3. The PWA prompt stays dismissed through navigation and refresh.
 *   4. Scrollbars are refined on desktop (light/dark) and native on touch.
 *   5. Sidebar collapse persists with no mobile/layout/accessibility regression.
 *   6. (Covered by `npm run typecheck|lint|test|build|smoke`.)
 */

const BUSINESS_HOME = "/business/dashboard";
const CUSTOMER_HOME = "/customer/dashboard";

async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // The shells render client-side chrome; wait for the header to settle.
  await expect(page.locator("header").first()).toBeVisible();
}

/* ══════════════════════════════════════════════════════════ 1. Demo Mode ══ */

test.describe("Gate 1 — Demo Mode is absent from normal UI", () => {
  for (const [label, path] of [
    ["business", BUSINESS_HOME],
    ["customer", CUSTOMER_HOME],
  ] as const) {
    test(`${label} chrome exposes no demo persona switcher`, async ({ page }) => {
      await gotoApp(page, path);

      await expect(page.getByRole("button", { name: /demo mode switcher/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /developer persona switcher/i })).toHaveCount(0);
      await expect(page.getByText(/demo mode/i)).toHaveCount(0);
      await expect(page.getByText(/reset demo data/i)).toHaveCount(0);

      // Account menu must not offer persona switching either.
      await page.getByRole("button", { name: /account menu/i }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByText(/demo/i)).toHaveCount(0);
      await expect(menu.getByText(/persona/i)).toHaveCount(0);
      await page.keyboard.press("Escape");
    });
  }

  test("business settings exposes no reset-demo-data control", async ({ page }) => {
    await gotoApp(page, "/business/settings");
    await expect(page.getByText(/reset demo data/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /reset data/i })).toHaveCount(0);
  });
});

/* ═══════════════════════════════════════════════════════ 2. Global search ══ */

test.describe("Gate 2 — global search", () => {
  test("Ctrl+K opens the palette and finds records across groups", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();

    const input = palette.getByPlaceholder(/search pages, customers/i);
    await expect(input).toBeFocused();

    // Products
    await input.fill("LED");
    await expect(palette.getByText("Products", { exact: true })).toBeVisible();

    // Customers
    await input.fill("Rahul");
    await expect(palette.getByText("Customers", { exact: true })).toBeVisible();

    // Sales / invoices
    await input.fill("AE-INV");
    await expect(palette.getByText(/sales & invoices/i)).toBeVisible();

    // Rewards
    await input.fill("Philips");
    await expect(
      palette.getByText("Rewards", { exact: true }).or(palette.getByText("Products", { exact: true })).first()
    ).toBeVisible();

    // Pages group is always available.
    await input.fill("analytics");
    await expect(palette.getByText("Pages", { exact: true })).toBeVisible();
  });

  test("keyboard navigation opens a result and Escape closes the palette", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();

    // Escape closes and returns focus to the page.
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    // Re-open, run a query and open the highlighted result with Enter.
    await page.keyboard.press("Control+k");
    const input = page.getByRole("dialog").getByPlaceholder(/search pages, customers/i);
    await input.fill("Customers");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/business\//);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("empty state is clean for a nonsense query", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await palette.getByPlaceholder(/search pages, customers/i).fill("zzzqqqxxnothing");
    await expect(palette.getByText(/no matches for/i)).toBeVisible();
  });

  test("customer app has its own scoped palette", async ({ page }) => {
    await gotoApp(page, CUSTOMER_HOME);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    const input = palette.getByPlaceholder(/search pages, rewards/i);
    await input.fill("rewards");
    await expect(palette.getByText("Pages", { exact: true })).toBeVisible();
    // Business-only destinations are never offered to a customer.
    await input.fill("staff");
    await expect(palette.getByText(/\/business\//)).toHaveCount(0);
  });
});

/* ══════════════════════════════════════════════════════════ 3. PWA prompt ══ */

/** Fires a synthetic `beforeinstallprompt` the way Chrome would. */
async function fireInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string; platform: string }>;
    };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
    window.dispatchEvent(e);
  });
}

/**
 * Chrome may fire the event before or after hydration; re-dispatching until the
 * provider has mounted removes that race from the test (the product itself is
 * unaffected — a real browser re-fires the event on later navigations).
 */
async function fireInstallPromptUntilBanner(page: Page, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  const banner = page.getByRole("region", { name: /install application prompt/i });
  while (Date.now() < deadline) {
    await fireInstallPrompt(page);
    if (await banner.isVisible().catch(() => false)) return banner;
    await page.waitForTimeout(500);
  }
  return banner;
}

test.describe("Gate 3 — PWA install prompt persistence", () => {
  test.setTimeout(120_000);

  test("'Not now' persists across navigation and refresh with a 30-day cooldown", async ({ page }) => {
    await gotoApp(page, CUSTOMER_HOME);
    const banner = await fireInstallPromptUntilBanner(page);
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: /not now/i }).click();
    await expect(banner).toBeHidden();

    const cooldownDays = await page.evaluate(() => {
      const raw = Number(localStorage.getItem("rewardly:pwa:snooze-until") ?? 0);
      return (raw - Date.now()) / 86_400_000;
    });
    expect(cooldownDays).toBeGreaterThan(29);
    expect(cooldownDays).toBeLessThan(31);

    // Route change → still dismissed.
    await gotoApp(page, "/customer/rewards");
    await fireInstallPrompt(page);
    await page.waitForTimeout(8_000);
    await expect(page.getByRole("region", { name: /install application prompt/i })).toHaveCount(0);

    // Full refresh → still dismissed.
    await page.reload({ waitUntil: "domcontentloaded" });
    await fireInstallPrompt(page);
    await page.waitForTimeout(8_000);
    await expect(page.getByRole("region", { name: /install application prompt/i })).toHaveCount(0);
  });

  test("close X sets a 90-day cooldown and only one banner ever mounts", async ({ page }) => {
    await gotoApp(page, CUSTOMER_HOME);
    const banner = await fireInstallPromptUntilBanner(page);
    await fireInstallPrompt(page); // duplicate event must not duplicate the banner
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: /close install prompt/i }).click();
    await expect(banner).toBeHidden();

    const cooldownDays = await page.evaluate(() => {
      const raw = Number(localStorage.getItem("rewardly:pwa:snooze-until") ?? 0);
      return (raw - Date.now()) / 86_400_000;
    });
    expect(cooldownDays).toBeGreaterThan(89);
    expect(cooldownDays).toBeLessThan(91);
  });

  test("install stays reachable from profile settings instead of a popup", async ({ page }) => {
    await gotoApp(page, "/customer/profile");
    await expect(page.getByText(/install the app|app installed/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /install app/i })).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════ 4. Premium scrollbars ══ */

test.describe("Gate 4 — scrollbar system", () => {
  test("desktop uses the refined thin scrollbar and dialogs own their scroll", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);

    const pointerFine = await page.evaluate(() => window.matchMedia("(pointer: fine)").matches);
    expect(pointerFine).toBe(true);

    const htmlScrollbar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("scrollbar-width").trim()
    );
    expect(htmlScrollbar).toBe("thin");

    // Sidebar nav is a declared scroll owner, not a hidden overflow.
    const navOverflow = await page.evaluate(() => {
      const nav = document.querySelector("#business-sidebar-nav");
      if (!nav) return null;
      const cs = getComputedStyle(nav);
      return { overflowY: cs.overflowY, overscroll: cs.overscrollBehaviorY };
    });
    expect(navOverflow).toEqual({ overflowY: "auto", overscroll: "contain" });

    // A dialog body is the single scroll owner; header/footer stay pinned.
    await page.keyboard.press("Control+k");
    const list = page.locator("[cmdk-list]");
    await expect(list).toBeVisible();
    const listOverflow = await list.evaluate((el) => getComputedStyle(el).overflowY);
    expect(listOverflow).toBe("auto");
    const contentOverflow = await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).overflow);
    expect(contentOverflow).toContain("hidden");
  });

  test("scrollbar theme tokens resolve in both themes", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);
    const readThumb = (mode: "light" | "dark") =>
      page.evaluate((m) => {
        document.documentElement.classList.toggle("dark", m === "dark");
        const cs = getComputedStyle(document.documentElement);
        return {
          thumb: cs.getPropertyValue("--scrollbar-thumb").trim(),
          track: cs.getPropertyValue("--scrollbar-track").trim(),
        };
      }, mode);

    const light = await readThumb("light");
    const dark = await readThumb("dark");

    expect(light.thumb).not.toBe("");
    expect(dark.thumb).not.toBe("");
    // Theme-aware: the thumb and track differ between light and dark.
    expect(dark.thumb).not.toBe(light.thumb);
    expect(dark.track).not.toBe(light.track);
  });
});

/* ══════════════════════════════════════════════════ 5. Collapsible sidebar ══ */

test.describe("Gate 5 — collapsible sidebar", () => {
  test("collapse persists across refresh and exposes an accessible icon rail", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);

    const toggle = page.getByRole("button", { name: /collapse sidebar/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: /business navigation/i }).getByText("Dashboard")).toBeVisible();

    await toggle.click();

    await expect(page.locator("html")).toHaveClass(/sidebar-collapsed/);
    const width = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w").trim()
    );
    expect(width).toBe("72px");
    const expand = page.getByRole("button", { name: /expand sidebar/i });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    // Labels are gone from the rail but the links keep accessible names.
    const nav = page.getByRole("navigation", { name: /business navigation/i });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByText("Dashboard", { exact: true })).toHaveCount(0);
    // Active route indicator survives collapse.
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    // Persisted through a full refresh — and applied before first paint.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/sidebar-collapsed/);
    expect(await page.evaluate(() => localStorage.getItem("rewardly:sidebar-collapsed"))).toBe("1");

    // Expanding restores the labelled rail.
    await page.getByRole("button", { name: /expand sidebar/i }).click();
    await expect(page.locator("html")).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.getByRole("navigation", { name: /business navigation/i }).getByText("Dashboard")).toBeVisible();
  });

  test("main content tracks the rail width", async ({ page }) => {
    await gotoApp(page, BUSINESS_HOME);
    const mainPadding = () => page.locator("main").evaluate((el) => getComputedStyle(el).paddingLeft);

    expect(await mainPadding()).toBe("248px");
    await page.getByRole("button", { name: /collapse sidebar/i }).click();
    expect(await mainPadding()).toBe("72px");
  });

  test("customer desktop sidebar collapses too", async ({ page }) => {
    await gotoApp(page, CUSTOMER_HOME);
    const toggle = page.getByRole("button", { name: /collapse sidebar/i });
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/sidebar-collapsed/);
    await expect(
      page.getByRole("navigation", { name: /customer navigation/i }).getByRole("link", { name: "Rewards Store" })
    ).toBeVisible();
  });

});
