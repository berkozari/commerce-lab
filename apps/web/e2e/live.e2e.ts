import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Real API + real PostgreSQL; only selected with EC014_E2E_LIVE=1.
// Uses the existing seeded "canvas-backpack" and a new account each run.
// Failure-path demo payment restores reserved inventory, so re-running doesn't consume stock.
test("real register -> cart -> checkout -> failed demo payment -> orders -> logout", async ({ page }) => {
    const email = `e2e.${randomUUID()}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Full name").fill("E2E Browser User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("E2E-Valid-Password-123!");
    await page.getByRole("button", { name: "Create account" }).click();
    // Registration redirects to /account when no returnTo path was provided.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, E2E Browser User" })).toBeVisible();
    await page.goto("/products/canvas-backpack");
    await expect(page.getByRole("heading", { name: "Canvas Backpack" })).toBeVisible();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart.")).toBeVisible();
    await page.getByRole("link", { name: "View cart" }).click();
    await page.getByRole("button", { name: "Proceed to checkout" }).click();
    await page.getByLabel("Recipient name").fill("E2E Recipient");
    await page.getByLabel("Phone").fill("5551112233");
    await page.getByLabel("City").fill("Istanbul");
    await page.getByLabel("District").fill("Kadikoy");
    await page.getByLabel("Address line").fill("E2E Example Street 123");
    await page.getByRole("button", { name: "Place demo order" }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/i);
    await page.getByRole("button", { name: "Demo payment failure" }).click();
    await expect(page.getByText("Order cancelled. No payment was charged.")).toBeVisible();
    await page.getByRole("link", { name: "All my orders" }).click();
    await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login$/);
});
