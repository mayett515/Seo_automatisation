import { expect, test } from "@playwright/test";

test("login screen renders sign-in and account-creation states", async ({ page }) => {
  await page.route("http://127.0.0.1:65535/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: "null"
    });
  });

  await page.goto("/login?redirect=/projects/demo-project/releases");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});
