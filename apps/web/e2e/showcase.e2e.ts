/**
 * EC-016.3 portfolio screenshots.
 * Renders the real React app with the same deterministic mock API used by browser.e2e.ts.
 * No real accounts, transactions, live databases, or secret values are used.
 * Not selected by the regular browser.e2e.ts / live.e2e.ts Playwright configurations.
 */
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { mockApi } from "./helpers/mock-api";

const output = path.resolve(import.meta.dirname, "../../../docs/assets/screenshots");

// Keep screenshots stable across machines and CI runs.
async function capture(page: import("@playwright/test").Page, name: string) {
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: path.join(output, name), fullPage: true, animations: "disabled" });
}

test("capture eight portfolio screens using synthetic data", async ({ page }) => {
    await mkdir(output, { recursive: true });
    await mockApi(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recently added" })).toBeVisible();
    await capture(page, "01-home-desktop.png");

    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Explore the collection" })).toBeVisible();
    await expect(page.getByText("Linen Backpack").first()).toBeVisible();
    await capture(page, "02-catalog-desktop.png");

    await page.goto("/products/linen-backpack");
    await expect(page.getByRole("heading", { name: "Linen Backpack" })).toBeVisible();
    await capture(page, "03-product-detail-desktop.png");

    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart.")).toBeVisible();
    await page.getByRole("link", { name: "View cart" }).click();
    await expect(page.getByRole("heading", { name: "Your shopping cart" })).toBeVisible();
    await capture(page, "04-cart-desktop.png");

    await page.getByRole("button", { name: "Sign in to checkout" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill("showcase@example.test");
    await page.getByLabel("Password").fill("NotARealPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByLabel("Recipient name").fill("Demo Receiver");
    await page.getByLabel("Phone").fill("5551112233");
    await page.getByLabel("City").fill("Istanbul");
    await page.getByLabel("District").fill("Kadikoy");
    await page.getByLabel("Address line").fill("Demo Street 123");
    await capture(page, "05-checkout-desktop.png");

    await page.getByRole("button", { name: "Place demo order" }).click();
    await expect(page).toHaveURL(/\/orders\/e2e-order$/);
    await expect(page.getByRole("heading", { name: "Order CL-E2E-001" })).toBeVisible();
    await page.getByRole("button", { name: "Demo payment success" }).click();
    await expect(page.getByText("Demo payment confirmed. Thank you!")).toBeVisible();
    await capture(page, "06-order-confirmation-desktop.png");

    await page.getByRole("link", { name: "All my orders" }).click();
    await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CL-E2E-001" })).toBeVisible();
    await capture(page, "07-order-history-desktop.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Explore the collection" })).toBeVisible();
    await expect(page.getByText("Linen Backpack").first()).toBeVisible();
    // A full-page screenshot expands to document width when a mobile layout overflows.
    // Fail with useful offender details instead of publishing a fake 390 px viewport image.
    const mobileLayout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const overflowing = Array.from(document.querySelectorAll("body *"))
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    element: element.tagName.toLowerCase(),
                    className: typeof element.className === "string" ? element.className.slice(0, 100) : "",
                    right: Math.round(rect.right),
                };
            })
            .filter((element) => element.right > viewport + 1)
            .slice(0, 8);
        return { viewport, scrollWidth, overflowing };
    });
    expect(mobileLayout.scrollWidth, `Mobile horizontal overflow: ${JSON.stringify(mobileLayout)}`).toBeLessThanOrEqual(390);
    await capture(page, "08-catalog-mobile.png");
});
