import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// EC-013.4.2 is opt-in. It uses a real PostgreSQL database, never the dev DB.
// The normal unit-test suite skips this file unless the dedicated URL is supplied.
const isolatedDatabaseUrl = process.env.EC013_AUTHZ_TEST_DATABASE_URL;

function assertIsolatedDatabase(urlValue: string): void {
    const url = new URL(urlValue);
    if (
        !["postgresql:", "postgres:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.port !== "5433" ||
        url.pathname !== "/commercelab_authz_test" ||
        url.username !== "commercelab" ||
        [...url.searchParams.keys()].some((key) => key !== "schema") ||
        (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")
    ) {
        throw new Error(
            "EC-013.4.2 refuses to use this DATABASE_URL: expected local port 5433, user commercelab, database commercelab_authz_test",
        );
    }
}

type PrismaClient = ReturnType<typeof import("../../src/config/database.js")["getPrisma"]>;
type App = typeof import("../../src/app.js")["app"];
type AuthContext = { cookie: string; csrfToken: string };

type Fixtures = {
    a: AuthContext;
    b: AuthContext;
    admin: AuthContext;
    aId: string;
    bId: string;
    aOrderId: string;
    bOrderId: string;
    aCartItemId: string;
    bCartItemId: string;
};

// Do not run test setup in a generic pnpm test invocation.
describe.skipIf(!isolatedDatabaseUrl)("EC-013.4.2: real database authorization and ownership", () => {
    let app: App;
    let db: PrismaClient;
    let disconnect: () => Promise<void>;
    let fixture: Fixtures;
    const created = {
        users: [] as string[],
        sessions: [] as string[],
        categories: [] as string[],
        products: [] as string[],
        variants: [] as string[],
        inventories: [] as string[],
        carts: [] as string[],
        cartItems: [] as string[],
        orders: [] as string[],
        orderItems: [] as string[],
    };

    beforeAll(async () => {
        // Validation MUST run before any database module is imported or queried.
        assertIsolatedDatabase(isolatedDatabaseUrl!);
        process.env.DATABASE_URL = isolatedDatabaseUrl!;
        process.env.NODE_ENV = "test";
        process.env.AUTH_JWT_SECRET = "ec013-authz-test-only-jwt-secret-do-not-use-in-production";
        process.env.AUTH_CSRF_SECRET = "ec013-authz-test-only-csrf-secret-do-not-use-in-production";

        const databaseModule = await import("../../src/config/database.js");
        db = databaseModule.getPrisma();
        disconnect = databaseModule.disconnectDatabase;

        // Defense in depth: verify the database name reported by PostgreSQL itself.
        const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
        if (actual[0]?.name !== "commercelab_authz_test") {
            throw new Error("Unsafe database target; refusing integration fixtures");
        }

        ({ app } = await import("../../src/app.js"));
        const { signAccessToken, createRefreshToken, hashToken } = await import("../../src/lib/auth-crypto.js");
        const { ACCESS_COOKIE, CSRF_COOKIE } = await import("../../src/lib/auth-cookies.js");
        const suffix = randomUUID().replace(/-/g, "").slice(0, 12);

        async function createUser(kind: "a" | "b" | "admin", role: "CUSTOMER" | "ADMIN") {
            const user = await db.user.create({
                data: {
                    email: `ec013-authz-${kind}-${suffix}@example.invalid`,
                    name: `EC013 Test ${kind}`,
                    passwordHash: "test-fixture-not-for-login",
                    role,
                },
            });
            created.users.push(user.id);
            const sessionId = randomUUID();
            await db.authSession.create({
                data: {
                    id: sessionId,
                    userId: user.id,
                    refreshTokenHash: hashToken(createRefreshToken(sessionId)),
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
            created.sessions.push(sessionId);
            const challenge = await request(app).get("/api/v1/auth/csrf");
            expect(challenge.status).toBe(200);
            const csrfToken = challenge.body.data.csrfToken as string;
            return {
                id: user.id,
                auth: {
                    cookie: `${ACCESS_COOKIE}=${await signAccessToken(user.id, sessionId)}; ${CSRF_COOKIE}=${csrfToken}`,
                    csrfToken,
                } satisfies AuthContext,
            };
        }

        const a = await createUser("a", "CUSTOMER");
        const b = await createUser("b", "CUSTOMER");
        const admin = await createUser("admin", "ADMIN");

        const category = await db.category.create({
            data: { name: "EC013 Integration", slug: `ec013-authz-${suffix}` },
        });
        created.categories.push(category.id);
        const product = await db.product.create({
            data: { categoryId: category.id, name: "EC013 Integration Product", slug: `ec013-item-${suffix}`, status: "ACTIVE" },
        });
        created.products.push(product.id);
        const variant = await db.productVariant.create({
            data: { productId: product.id, sku: `EC013-${suffix}`, name: "Default", price: "19.90", isActive: true },
        });
        created.variants.push(variant.id);
        const inventory = await db.inventory.create({ data: { variantId: variant.id, quantity: 100 } });
        created.inventories.push(inventory.id);

        async function makeCart(userId: string): Promise<string> {
            const cart = await db.cart.create({
                data: { userId, items: { create: [{ variantId: variant.id, quantity: 1 }] } },
                include: { items: true },
            });
            created.carts.push(cart.id);
            created.cartItems.push(cart.items[0]!.id);
            return cart.items[0]!.id;
        }
        const aCartItemId = await makeCart(a.id);
        const bCartItemId = await makeCart(b.id);

        async function makeOrder(userId: string, suffixPart: string): Promise<string> {
            const order = await db.order.create({
                data: {
                    userId,
                    orderNumber: `EC013-${suffix}-${suffixPart}`,
                    status: "PENDING", paymentStatus: "UNPAID", currency: "TRY",
                    subtotal: "19.90", shippingAmount: "0.00", total: "19.90",
                    shippingAddressSnapshot: {
                        recipientName: "EC013 Test", phone: "5551234567", country: "TR",
                        city: "Test City", district: "Test District", addressLine: "Test address only",
                    },
                    items: {
                        create: [{
                            variantId: variant.id,
                            productName: "EC013 Integration Product", sku: `EC013-${suffix}`,
                            quantity: 1, unitPrice: "19.90", totalPrice: "19.90",
                        }],
                    },
                },
                include: { items: true },
            });
            created.orders.push(order.id);
            created.orderItems.push(...order.items.map((item) => item.id));
            return order.id;
        }
        const aOrderId = await makeOrder(a.id, "A");
        const bOrderId = await makeOrder(b.id, "B");

        fixture = {
            a: a.auth, b: b.auth, admin: admin.auth,
            aId: a.id, bId: b.id, aOrderId, bOrderId, aCartItemId, bCartItemId,
        };
    }, 30_000);

    afterAll(async () => {
        if (!db) return;
        try {
            // Delete ONLY IDs created by this test. Never truncate tables.
            await db.orderItem.deleteMany({ where: { id: { in: created.orderItems } } });
            await db.order.deleteMany({ where: { id: { in: created.orders } } });
            await db.cartItem.deleteMany({ where: { id: { in: created.cartItems } } });
            await db.cart.deleteMany({ where: { id: { in: created.carts } } });
            await db.authSession.deleteMany({ where: { id: { in: created.sessions } } });
            await db.inventory.deleteMany({ where: { id: { in: created.inventories } } });
            await db.productVariant.deleteMany({ where: { id: { in: created.variants } } });
            await db.product.deleteMany({ where: { id: { in: created.products } } });
            await db.category.deleteMany({ where: { id: { in: created.categories } } });
            await db.user.deleteMany({ where: { id: { in: created.users } } });
        } finally {
            await disconnect();
        }
    }, 30_000);

    function cookies(context: AuthContext): { Cookie: string } {
        return { Cookie: context.cookie };
    }

    function mutationHeaders(context: AuthContext): { Cookie: string; "x-csrf-token": string } {
        return { ...cookies(context), "x-csrf-token": context.csrfToken };
    }

    it("each customer sees only their own order in list and detail", async () => {
        const listA = await request(app).get("/api/v1/orders").set(cookies(fixture.a));
        const listB = await request(app).get("/api/v1/orders").set(cookies(fixture.b));
        expect(listA.status).toBe(200);
        expect(listB.status).toBe(200);
        expect(listA.body.data.items.map((item: { id: string }) => item.id)).toEqual([fixture.aOrderId]);
        expect(listB.body.data.items.map((item: { id: string }) => item.id)).toEqual([fixture.bOrderId]);
        expect((await request(app).get(`/api/v1/orders/${fixture.aOrderId}`).set(cookies(fixture.a))).status).toBe(200);
        expect((await request(app).get(`/api/v1/orders/${fixture.bOrderId}`).set(cookies(fixture.b))).status).toBe(200);
    });

    it("returns 404 in both directions for another customer's order ID", async () => {
        const aTriesB = await request(app).get(`/api/v1/orders/${fixture.bOrderId}`).set(cookies(fixture.a));
        const bTriesA = await request(app).get(`/api/v1/orders/${fixture.aOrderId}`).set(cookies(fixture.b));
        expect(aTriesB.status).toBe(404);
        expect(bTriesA.status).toBe(404);
    });

    it("rejects non-owner demo payment and leaves the database row unchanged", async () => {
        const before = await db.order.findUniqueOrThrow({ where: { id: fixture.bOrderId } });
        const response = await request(app)
            .post(`/api/v1/orders/${fixture.bOrderId}/demo-payment`)
            .set(mutationHeaders(fixture.a))
            .send({ outcome: "success" });
        expect(response.status).toBe(404);
        const after = await db.order.findUniqueOrThrow({ where: { id: fixture.bOrderId } });
        expect(after.status).toBe(before.status);
        expect(after.paymentStatus).toBe(before.paymentStatus);
    });

    it("returns each customer's own cart without exposing the other item ID", async () => {
        const cartA = await request(app).get("/api/v1/cart").set(cookies(fixture.a));
        const cartB = await request(app).get("/api/v1/cart").set(cookies(fixture.b));
        expect(cartA.status).toBe(200);
        expect(cartB.status).toBe(200);
        expect(cartA.body.data.items.map((item: { id: string }) => item.id)).toEqual([fixture.aCartItemId]);
        expect(cartB.body.data.items.map((item: { id: string }) => item.id)).toEqual([fixture.bCartItemId]);
    });

    it("rejects cross-user cart quantity changes and preserves the owner's quantity", async () => {
        const response = await request(app).patch(`/api/v1/cart/items/${fixture.bCartItemId}`)
            .set(mutationHeaders(fixture.a)).send({ quantity: 8 });
        expect(response.status).toBe(404);
        const item = await db.cartItem.findUniqueOrThrow({ where: { id: fixture.bCartItemId } });
        expect(item.quantity).toBe(1);
    });

    it("rejects cross-user cart item deletion and leaves the item present", async () => {
        const response = await request(app).delete(`/api/v1/cart/items/${fixture.aCartItemId}`)
            .set(mutationHeaders(fixture.b));
        expect(response.status).toBe(404);
        expect(await db.cartItem.count({ where: { id: fixture.aCartItemId } })).toBe(1);
    });

    it("rejects anonymous order reads and customer access to admin data", async () => {
        expect((await request(app).get("/api/v1/orders")).status).toBe(401);
        expect((await request(app).get("/api/v1/admin/orders").set(cookies(fixture.a))).status).toBe(403);
        expect((await request(app).get("/api/v1/admin/products").set(cookies(fixture.b))).status).toBe(403);
    });

    it("rejects customer admin mutations without altering an order", async () => {
        const response = await request(app).patch(`/api/v1/admin/orders/${fixture.bOrderId}/status`)
            .set(mutationHeaders(fixture.a)).send({ status: "CANCELLED" });
        expect(response.status).toBe(403);
        const order = await db.order.findUniqueOrThrow({ where: { id: fixture.bOrderId } });
        expect(order.status).toBe("PENDING");
    });

    it("allows ADMIN to list both customers' orders", async () => {
        const response = await request(app).get("/api/v1/admin/orders").set(cookies(fixture.admin));
        expect(response.status).toBe(200);
        const ids = response.body.data.items.map((item: { id: string }) => item.id);
        expect(ids).toContain(fixture.aOrderId);
        expect(ids).toContain(fixture.bOrderId);
    });

    it("guest cart identity cannot update a customer's cart item", async () => {
        const guestToken = (await import("../../src/lib/cart-cookie.js")).newGuestToken();
        const { GUEST_CART_COOKIE } = await import("../../src/lib/cart-cookie.js");
        const { CSRF_COOKIE } = await import("../../src/lib/auth-cookies.js");
        const challenge = await request(app).get("/api/v1/auth/csrf");
        const csrfToken = challenge.body.data.csrfToken as string;
        // A real guest cart is created by the normal HTTP path; track its ID for cleanup.
        const guestCookies = `${GUEST_CART_COOKIE}=${guestToken}; ${CSRF_COOKIE}=${csrfToken}`;
        const own = await request(app).get("/api/v1/cart").set("Cookie", guestCookies);
        expect(own.status).toBe(200);
        created.carts.push(own.body.data.id as string);
        const response = await request(app).patch(`/api/v1/cart/items/${fixture.aCartItemId}`)
            .set("Cookie", guestCookies).set("x-csrf-token", csrfToken).send({ quantity: 7 });
        expect(response.status).toBe(404);
        expect((await db.cartItem.findUniqueOrThrow({ where: { id: fixture.aCartItemId } })).quantity).toBe(1);
    });
});
