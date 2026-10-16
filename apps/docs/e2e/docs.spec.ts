import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Accessibility (axe-core, WCAG 2.2 AA), broken links and phone layout for every documentation page. */
const PAGES = [
  "", "guide/getting-started", "guide/format", "guide/models", "guide/http", "guide/react", "guide/vue", "guide/angular",
  "guide/svelte-solid", "guide/llms", "guide/cli", "guide/benchmarks", "guide/security",
];

for (const scheme of ["light", "dark"] as const) {
  for (const path of PAGES) {
    test(`${scheme}: /${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.emulateMedia({ colorScheme: scheme });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("internal links all resolve", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    for (const href of await page.locator("a[href^='/flattype/docs/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname))) {
      if (seen.has(href)) continue;
      seen.add(href);
      expect((await request.get(href)).status(), `${href} (linked from /${path})`).toBe(200);
    }
  }
  expect(seen.size).toBeGreaterThan(5);
});

test("no page scrolls sideways on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  for (const path of PAGES) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});
