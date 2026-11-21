import type { Page, Route } from "@playwright/test";

const product = {
    id: "e2e-product", slug: "linen-backpack", name: "Linen Backpack",
    description: "A demo everyday backpack", categoryId: "e2e-category",
    category: { id: "e2e-category", name: "Accessories", slug: "accessories" },
    images: [],
    variants: [{ id: "e2e-variant", sku: "E2E-BAG-001", name: "Default", price: "1299.00", currency: "TRY", attributes: {}, isActive: true }],
    createdAt: "2026-01-01T00:00:00.000Z",
};
const category = { id: "e2e-category", name: "Accessories", slug: "accessories", parentId: null, children: [] };
type DemoUser = { id: string; name: string; email: string; role: "CUSTOMER" };

type Order = {
    id: string; orderNumber: string; status: string; paymentStatus: string; currency: string;
    subtotal: string; shippingAmount: string; total: string;
    shippingAddress: Record<string, string>;
    items: Array<{ id: string; variantId: string; productName: string; sku: string; quantity: number; unitPrice: string; totalPrice: string }>;
    createdAt: string; updatedAt: string;
};

export async function mockApi(page: Page) {
    let user: DemoUser | null = null;
    let quantity = 0;
    let order: Order | null = null;
    const checkoutKeys: string[] = [];
    const cart = () => ({
        id: "e2e-cart",
        items: quantity ? [{
            id: "e2e-line", variantId: "e2e-variant", quantity, sku: "E2E-BAG-001",
            variantName: "Default", product: { id: product.id, name: product.name, slug: product.slug },
            unitPrice: "1299.00", lineTotal: (1299 * quantity).toFixed(2), currency: "TRY",
            available: true, unavailableReason: null,
        }] : [],
        itemCount: quantity, availableSubtotal: (1299 * quantity).toFixed(2), currency: "TRY",
    });
    const reply = (route: Route, data: unknown, status = 200) => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { error: { message: String(data) } }) }),
    });

    await page.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;
        const method = request.method();
        const json = (): Record<string, unknown> => {
            try { return request.postDataJSON() as Record<string, unknown>; } catch { return {}; }
        };
        if (pathname === "/api/v1/auth/csrf" && method === "GET") return reply(route, { csrfToken: "e2e-csrf" });
        if (pathname === "/api/v1/auth/me" && method === "GET") return user ? reply(route, { user }) : reply(route, "Unauthorized", 401);
        if (pathname === "/api/v1/auth/refresh" && method === "POST") return reply(route, "Unauthorized", 401);
        if ((pathname === "/api/v1/auth/register" || pathname === "/api/v1/auth/login") && method === "POST") {
            const input = json();
            user = { id: "e2e-user", name: pathname.endsWith("/register") ? String(input.name) : "E2E Tester", email: String(input.email), role: "CUSTOMER" };
            return reply(route, { user }, pathname.endsWith("/register") ? 201 : 200);
        }
        if ((pathname === "/api/v1/auth/logout" || pathname === "/api/v1/auth/logout-all") && method === "POST") {
            user = null; return reply(route, { loggedOut: true });
        }
        if (pathname === "/api/v1/categories" && method === "GET") return reply(route, [category]);
        if (pathname === "/api/v1/products" && method === "GET") {
            const q = (url.searchParams.get("q") ?? "").toLowerCase();
            const items = !q || product.name.toLowerCase().includes(q) ? [product] : [];
            return reply(route, { items, pagination: { page: 1, limit: 12, total: items.length, totalPages: items.length ? 1 : 0 } });
        }
        if (pathname === `/api/v1/products/${product.slug}` && method === "GET") return reply(route, product);
        if (pathname === "/api/v1/cart" && method === "GET") return reply(route, cart());
        if (pathname === "/api/v1/cart/items" && method === "POST") {
            quantity += Number(json().quantity ?? 1); return reply(route, cart());
        }
        if (pathname === "/api/v1/cart/items/e2e-line" && method === "PATCH") {
            quantity = Number(json().quantity ?? 1); return reply(route, cart());
        }
        if (pathname === "/api/v1/cart/items/e2e-line" && method === "DELETE") { quantity = 0; return reply(route, cart()); }
        if (pathname === "/api/v1/cart" && method === "DELETE") { quantity = 0; return reply(route, cart()); }
        if (pathname === "/api/v1/cart/merge" && method === "POST") return reply(route, cart());
        if (pathname === "/api/v1/checkout" && method === "POST") {
            if (!user) return reply(route, "Unauthorized", 401);
            const key = request.headers()["idempotency-key"];
            if (key) checkoutKeys.push(key);
            const input = json();
            const shippingAddress = input.shippingAddress as Record<string, string>;
            order = {
                id: "e2e-order", orderNumber: "CL-E2E-001", status: "PENDING", paymentStatus: "UNPAID",
                currency: "TRY", subtotal: (quantity * 1299).toFixed(2), shippingAmount: "0.00", total: (quantity * 1299).toFixed(2),
                shippingAddress,
                items: [{ id: "e2e-order-line", variantId: "e2e-variant", productName: product.name, sku: "E2E-BAG-001", quantity, unitPrice: "1299.00", totalPrice: (1299 * quantity).toFixed(2) }],
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            quantity = 0;
            return reply(route, { order, replayed: false }, 201);
        }
        if (pathname === "/api/v1/orders" && method === "GET") return user ? reply(route, { items: order ? [order] : [], total: order ? 1 : 0, page: 1, limit: 10 }) : reply(route, "Unauthorized", 401);
        if (pathname === "/api/v1/orders/e2e-order" && method === "GET") return user && order ? reply(route, order) : reply(route, "Not found", 404);
        if (pathname === "/api/v1/orders/e2e-order/demo-payment" && method === "POST") {
            if (!order) return reply(route, "Not found", 404);
            const outcome = json().outcome;
            order = { ...order, status: outcome === "success" ? "CONFIRMED" : "CANCELLED", paymentStatus: outcome === "success" ? "PAID_DEMO" : "UNPAID" };
            return reply(route, order);
        }
        return reply(route, `Unmocked endpoint: ${method} ${pathname}`, 501);
    });
    return { checkoutKeys, getUser: () => user, getOrder: () => order };
}
