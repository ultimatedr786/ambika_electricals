import { test, expect, type Page } from "@playwright/test";

/**
 * MVP UI acceptance gate — touch layouts (runs under the `mobile` project,
 * Pixel 7 emulation with a coarse pointer and real touch events).
 *
 * Covers the touch halves of gates 4 and 5:
 *   • native scrolling is preserved (the refined scrollbar CSS is scoped to
 *     `@media (pointer: fine)` and must not apply here),
 *   • the drawer + bottom navigation behave exactly as before — no icon rail is
 *     ever forced onto a touch layout.
 */

async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("header").first()).toBeVisible();
}

test("touch layout keeps native scrolling", async ({ page }) => {
  await gotoApp(page, "/customer/dashboard");

  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
  expect(await page.evaluate(() => window.matchMedia("(pointer: fine)").matches)).toBe(false);

  // Declared scroll owners still scroll natively with contained overscroll.
  const body = await page.evaluate(() => getComputedStyle(document.body).overflowY);
  expect(["visible", "auto"]).toContain(body);
});

test("mobile keeps the drawer and bottom navigation, never the icon rail", async ({ page }) => {
  await gotoApp(page, "/business/dashboard");

  // The desktop rail is display:none below `lg` …
  await expect(page.locator("aside")).toBeHidden();
  // … and no collapse control is reachable on touch.
  await expect(page.getByRole("button", { name: /collapse sidebar/i })).toBeHidden();

  // Bottom navigation and the "More" drawer still work.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("button", { name: /^more$/i }).click();
  await expect(page.getByRole("dialog").getByText(/all sections/i)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("mobile chrome exposes no demo persona switcher", async ({ page }) => {
  await gotoApp(page, "/business/dashboard");
  await expect(page.getByText(/demo mode/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /persona switcher/i })).toHaveCount(0);
});

test("mobile search button opens the global palette", async ({ page }) => {
  await gotoApp(page, "/business/dashboard");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder(/search pages, customers/i).fill("LED");
  await expect(palette.getByText("Products", { exact: true })).toBeVisible();
});

test("collapsed desktop preference never leaks into the touch layout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rewardly:sidebar-collapsed", "1"));
  await gotoApp(page, "/business/dashboard");

  // The boot script still applies the class (it is a global preference) …
  await expect(page.locator("html")).toHaveClass(/sidebar-collapsed/);
  // … but the touch layout never renders the rail, so nothing changes for the user.
  await expect(page.locator("aside")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const mainPadding = await page.locator("main").evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(mainPadding).toBe("0px");
});
