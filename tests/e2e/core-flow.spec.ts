import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const VERIFIED = "DZiWqJiWqJiaXpiYJJiXwJiblJiYLpiWnpiWnpiWlJibgJiWipibxgcADogADogARDQARDQADpIABgQACigBBg==";
const urlSafe = VERIFIED.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.goto("./");
  await expect(page.getByRole("searchbox")).toBeEnabled();
});

test("keyboard only: search, add with Enter, pick energy, undo", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard flow is desktop");
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.type("mega lucario");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const panel = page.locator(".deck-panel");
  await expect(panel.getByLabel("2 of 20 cards")).toBeVisible();
  await expect(panel.getByText("Add 18 more cards")).toBeVisible();

  // third copy is refused with a calm explanation, not an alert
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("Max 2");
  await expect(panel.getByLabel("2 of 20 cards")).toBeVisible();

  // energy picker is reachable and toggles with the keyboard
  const fighting = panel.getByRole("button", { name: /^Fighting energy/ });
  await fighting.focus();
  await page.keyboard.press("Enter");
  await expect(fighting).toHaveAttribute("aria-pressed", "true");

  // undo with ⌘/Ctrl+Z outside a text field
  await fighting.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(fighting).toHaveAttribute("aria-pressed", "false");
});

test("sample deck → Generate QR carries the in-game verified payload", async ({ page, isMobile }) => {
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Load a sample deck" }).click();
  const generate = isMobile ? page.locator(".deckbar .primary") : page.locator(".deck-panel").getByRole("button", { name: "Generate QR" });
  await expect(generate).toBeEnabled();
  await generate.click();
  const dialog = page.getByRole("dialog", { name: /Mega Lucario ex/ });
  await expect(dialog).toBeVisible();
  await dialog.getByText("Deck code (technical)").click();
  await expect(dialog.locator(".code-text")).toHaveText(VERIFIED);
  await dialog.getByRole("radio", { name: "QR card" }).click();
  await expect(dialog.getByRole("img", { name: /QR card for/ })).toBeVisible();
});

test("share link opens the same deck, even after reload", async ({ page }) => {
  await page.goto(`./#d=${urlSafe}&n=Shared%20Lucario`);
  // desktop shows the deck panel, phones show the sticky bar: check whichever counter is visible
  const counter = page.getByLabel("20 of 20 cards").filter({ visible: true });
  await expect(counter.first()).toBeVisible();
  await page.reload(); // autosave keeps it
  await expect(counter.first()).toBeVisible();
});

test("mobile: sticky deck bar opens the deck sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.getByRole("searchbox").fill("riolu");
  await page.locator("li.tile").first().getByRole("button", { name: /^Add one Riolu/ }).click();
  const bar = page.locator(".deckbar-open");
  await expect(bar).toContainText("1");
  await expect(bar).toContainText("Add 19 more cards");
  await bar.click();
  await expect(page.locator(".deck-sheet")).toBeVisible();
  await expect(page.locator(".deck-sheet").getByText("Riolu", { exact: true })).toBeVisible();
});

test("no serious accessibility violations (axe)", async ({ page }) => {
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Load a sample deck" }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
});
