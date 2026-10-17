import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("encodes the sample and shows real savings", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#output")).toContainText("data[3]{id,full_name,created_at,role,address.city,address.zip}:");
  await expect(page.locator("#saved")).toHaveText(/^\d+%$/);
});

test("updates as you type and reports errors with their position", async ({ page }) => {
  await page.goto("./");
  await page.locator("#input").fill('{"name": "John", "age": 30, "city": "New York"}');
  await expect(page.locator("#output")).toHaveText("name: John\nage: 30\ncity: New York");
  await page.locator("#input").fill('{"name": ');
  await expect(page.getByRole("alert")).toContainText("JSON:");
});

test("decodes Flat Notation and generates a model", async ({ page }) => {
  await page.goto("./");
  await page.getByText("Flat → JSON").click();
  await expect(page.locator("#inLabel")).toHaveText("Flat Notation input");
  await page.locator("#input").fill("users[2]{id,full_name}:\n  1, Alice\n  2, Bob");
  await expect(page.locator("#output")).toContainText('"full_name": "Alice"');
  await page.getByRole("tab", { name: "TypeScript model" }).click();
  await expect(page.locator("#model")).toContainText("fullName: \"string\",");
  await page.locator("#input").fill("a 1");
  await expect(page.getByRole("alert")).toContainText("line 1, column 2");
});

test("options change the output", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Nested object" }).click();
  await expect(page.locator("#output")).toContainText("settings.notifications.email: true");
  await page.getByRole("button", { name: "API list" }).click();
  await page.getByLabel("Delimiter").selectOption({ label: "pipe" });
  await expect(page.locator("#output")).toContainText("data[3|]{");
  await page.getByLabel("Tables").uncheck();
  await expect(page.locator("#output")).toContainText("data[+].id:");
  await page.getByLabel("Tables").check();
  await page.getByLabel("Delimiter").selectOption({ label: "comma" });
  await page.getByRole("button", { name: "Mixed shapes" }).click();
  await expect(page.locator("#output")).toContainText("contacts[3]{id,name,phone?,city?}:");
  await expect(page.locator("#output")).toContainText("events[+].type: push");
});

for (const scheme of ["light", "dark"] as const) {
  test(`has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("./");
    await expect(page.locator("#output")).not.toBeEmpty();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
  });
}

test("does not scroll sideways on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("./");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
