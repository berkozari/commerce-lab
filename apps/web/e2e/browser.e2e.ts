import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers/mock-api";

test("unauthenticated protected route redirects to login and preserves destination", async ({ page }) => {
    await mockApi(page);
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill("demo@example.test");
    await page.getByLabel("Password").fill("ValidPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("registration validation prevents an invalid submission", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/register");
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Name must be at least 2 characters")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Password must be at least 10 characters")).toBeVisible();
    expect(api.getUser()).toBeNull();
});

test("registration, account view and sign out invalidate the protected session", async ({ page }) => {
    await mockApi(page);
    await page.goto("/register");
    await page.getByLabel("Full name").fill("E2E Tester");
    await page.getByLabel("Email").fill("e2e@example.test");
    await page.getByLabel("Password").fill("ValidPassword123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, E2E Tester" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);
});

test("catalog search, empty state and product details", async ({ page }) => {
    await mockApi(page);
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Explore the collection" })).toBeVisible();
    await expect(page.getByText("Linen Backpack").first()).toBeVisible();
    await page.getByLabel("Search products").fill("impossible-query");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "No products found" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("Linen Backpack").first()).toBeVisible();
    await page.goto("/products/linen-backpack");
    await expect(page.getByRole("heading", { name: "Linen Backpack" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
});

test("guest cart quantity, login, checkout, demo payment and order history", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/products/linen-backpack");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart.")).toBeVisible();
    await page.getByRole("link", { name: "View cart" }).click();
    await expect(page.getByRole("heading", { name: "Your shopping cart" })).toBeVisible();
    await page.getByLabel("Quantity").selectOption("2");
    await expect(page.getByText("Items (2)")).toBeVisible();
    await page.getByRole("button", { name: "Sign in to checkout" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill("e2e@example.test");
    await page.getByLabel("Password").fill("ValidPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await page.getByLabel("Recipient name").fill("Demo Receiver");
    await page.getByLabel("Phone").fill("5551112233");
    await page.getByLabel("City").fill("Istanbul");
    await page.getByLabel("District").fill("Kadikoy");
    await page.getByLabel("Address line").fill("Demo Street Number 123");
    await page.getByRole("button", { name: "Place demo order" }).click();
    await expect(page).toHaveURL(/\/orders\/e2e-order$/);
    await expect(page.getByRole("heading", { name: "Order CL-E2E-001" })).toBeVisible();
    expect(api.checkoutKeys).toHaveLength(1);
    expect(api.checkoutKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    await page.getByRole("button", { name: "Demo payment success" }).click();
    await expect(page.getByText("Demo payment confirmed. Thank you!")).toBeVisible();
    await page.getByRole("link", { name: "All my orders" }).click();
    await expect(page.getByRole("heading", { name: "CL-E2E-001" })).toBeVisible();
});

test("empty cart cannot proceed to checkout", async ({ page }) => {
    await mockApi(page);
    await page.goto("/cart");
    await expect(page.getByText("Your cart is empty")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore products" })).toBeVisible();
});
