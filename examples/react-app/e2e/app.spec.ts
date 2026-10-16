import { expect, test } from "@playwright/test";

test("lists users fetched as Flat Notation and mapped to models", async ({ page }) => {
  // Check the app's request rather than its response: React StrictMode (dev) mounts twice, so the first
  // request is aborted on purpose and its response body may already be gone.
  const request = page.waitForRequest((r) => r.url().endsWith("/api/users"));
  await page.goto("/");
  expect((await request).headers()["accept"]).toMatch(/^text\/x-flat/);
  // And what the server sends for that Accept header:
  const [type, body] = await page.evaluate(async (accept) => {
    const r = await fetch("/api/users", { headers: { accept } });
    return [r.headers.get("content-type"), await r.text()];
  }, (await request).headers()["accept"]!);
  expect(type).toMatch(/^text\/x-flat/);
  expect(body).toContain("data[8]{id,full_name,created_at,address.city}:");
  const users = page.getByTestId("users").locator("li");
  await expect(users).toHaveCount(8);
  await expect(users.first()).toHaveText("Alice Martin · Paris · joined 01/01/2026");
});

test("suspends for the profile and switches on click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("profile")).toHaveText("#1 Alice Martin lives in Paris");
  await page.getByRole("button", { name: "Chen Wei" }).click();
  await expect(page.getByTestId("profile")).toHaveText("#3 Chen Wei lives in Tokyo");
});

test("renders streamed rows before the download finishes", async ({ page }) => {
  await page.goto("/");
  const status = page.getByTestId("export-status");
  await expect(status).toHaveText(/Downloading… [1-9]\d* rows so far/);
  const partial = await page.getByTestId("export").locator("li").count();
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(200);
  await expect(status).toHaveText("Done: 200 rows");
  await expect(page.getByTestId("export").locator("li")).toHaveCount(200);
});

test("plain clients still get JSON", async ({ request }) => {
  const res = await request.get("/api/users");
  expect(res.headers()["content-type"]).toMatch(/application\/json/);
  expect((await res.json()).data).toHaveLength(8);
});
