import { expect, test } from "@playwright/test";

test("local scaffold shell renders and navigates core routes", async ({ page }) => {
  await page.route("**/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        service: "local-seo-api",
        stack: {
          http: "NestJS/Fastify",
          workers: "BullMQ",
          ai: "Mastra"
        }
      })
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Mission Control" })).toBeVisible();
  await expect(page.getByText("local scaffold")).toBeVisible();
  await expect(page.getByText("Preview required")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();

  await page.getByRole("link", { name: "GSC" }).click();

  await expect(page).toHaveURL(/\/projects\/demo-project\/gsc\/connect/u);
  await expect(page.getByRole("heading", { name: "Google Search Console" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
});
