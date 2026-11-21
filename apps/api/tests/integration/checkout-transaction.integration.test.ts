import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in real PostgreSQL tests. NEVER point this suite to commercelab_dev.
const isolatedDatabaseUrl = process.env.EC013_CHECKOUT_TEST_DATABASE_URL;

function assertIsolatedDatabase(urlValue: string): void {
    const url = new URL(urlValue);
    if (
        !["postgresql:", "postgres:"].includes(url.protocol) ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "5433" ||
        url.pathname !== "/commercelab_checkout_test" ||
        url.username !== "commercelab" ||
        [...url.searchParams.keys()].some((key) => key !== "schema") ||
        (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")
    ) {
        throw new Error("EC-013.6.1: expected local port 5433, user commercelab, database commercelab_checkout_test");
    }
}

type PrismaClient = ReturnType<typeof import("../../src/config/database.js")["getPrisma"]>;
type App = typeof import("../../src/app.js")["app"];
type Auth = { userId: string; cookie: string; csrfToken: string };
type ProductFixture = { variantId: string; price: string };

const shippingAddress = {
    recipientName: "Checkout Test Customer",
    phone: "+905551112233",
    country: "TR" as const,
    city: "Istanbul",
    district: "Kadikoy",
    addressLine: "Only a test address, building 42",
};

const uniqueKey = (): string => `checkout_${randomUUID()}`;

// A missing explicit URL skips the suite during ordinary `pnpm test` runs.
describe.skipIf(!isolatedDatabaseUrl)("EC-013.6.1: real DB checkout atomicity and idempotency", () => {
    let app: App;
    let db: PrismaClient;
    let disconnect: () => Promise<void>;
    let categoryId: string;
    let accessCookieName: string;
    let csrfCookieName: string;
    const created = {
        users: [] as string[],
        sessions: [] as string[],
        products: [] as string[],
        variants: [] as string[],
        inventories: [] as string[],
        carts: [] as string[],
    };

    beforeAll(async () => {
        // Validate BEFORE importing application / database modules or making queries.
        assertIsolatedDatabase(isolatedDatabaseUrl!);
        process.env.DATABASE_URL = isolatedDatabaseUrl!;
        process.env.NODE_ENV = "test";
        process.env.AUTH_JWT_SECRET = "ec013-checkout-test-only-jwt-secret-never-for-production";
        process.env.AUTH_CSRF_SECRET = "ec013-checkout-test-only-csrf-secret-never-for-production";
        process.env.CORS_ORIGIN = "http://127.0.0.1:5173";

        const databaseModule = await import("../../src/config/database.js");
        db = databaseModule.getPrisma();
        disconnect = databaseModule.disconnectDatabase;

        // Second guard: confirm the PostgreSQL server's actual database name.
        const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
        if (actual[0]?.name !== "commercelab_checkout_test") {
            throw new Error("EC-013.6.1 refuses to write to unexpected database");
        }

        ({ app } = await import("../../src/app.js"));
        const cookieModule = await import("../../src/lib/auth-cookies.js");
        accessCookieName = cookieModule.ACCESS_COOKIE;
        csrfCookieName = cookieModule.CSRF_COOKIE;
        const category = await db.category.create({
            data: { name: "EC013 Checkout Isolation", slug: `ec013-checkout-${randomUUID()}` },
        });
        categoryId = category.id;
    }, 30_000);

    afterAll(async () => {
        if (!db) return;
        try {
            // Delete only data belonging to users / objects created by this suite.
            // Never TRUNCATE, reset, or delete unrelated records.
            const orderRecords = await db.order.findMany({
                where: { userId: { in: created.users } }, select: { id: true },
            });
            const orderIds = orderRecords.map((item) => item.id);
            await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
            await db.order.deleteMany({ where: { id: { in: orderIds } } });
            await db.cartItem.deleteMany({ where: { cartId: { in: created.carts } } });
            await db.cart.deleteMany({ where: { id: { in: created.carts } } });
            await db.authSession.deleteMany({ where: { id: { in: created.sessions } } });
            await db.inventory.deleteMany({ where: { id: { in: created.inventories } } });
            await db.productVariant.deleteMany({ where: { id: { in: created.variants } } });
            await db.product.deleteMany({ where: { id: { in: created.products } } });
            if (categoryId) await db.category.delete({ where: { id: categoryId } });
            await db.user.deleteMany({ where: { id: { in: created.users } } });
        } finally {
            await disconnect();
        }
    }, 30_000);

    async function makeCustomer(): Promise<Auth> {
        const user = await db.user.create({
            data: {
                name: "EC013 Checkout Customer",
                email: `ec013-checkout-${randomUUID()}@example.invalid`,
                passwordHash: "test-fixture-not-for-login",
                role: "CUSTOMER",
            },
        });
        created.users.push(user.id);
        const sessionId = randomUUID();
        const { createRefreshToken, hashToken, signAccessToken } = await import("../../src/lib/auth-crypto.js");
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
            userId: user.id,
            cookie: `${accessCookieName}=${await signAccessToken(user.id, sessionId)}; ${csrfCookieName}=${csrfToken}`,
            csrfToken,
        };
    }

    async function makeProduct(stock: number, price = "39.95"): Promise<ProductFixture> {
        const suffix = randomUUID().replace(/-/g, "").slice(0, 15);
        const product = await db.product.create({
            data: {
                categoryId,
                name: `Checkout Product ${suffix}`,
                slug: `checkout-product-${suffix}`,
                status: "ACTIVE",
            },
        });
        created.products.push(product.id);
        const variant = await db.productVariant.create({
            data: {
                productId: product.id,
                sku: `EC013-CHECK-${suffix}`,
                name: "Default",
                price,
                currency: "TRY",
                isActive: true,
            },
        });
        created.variants.push(variant.id);
        const inventory = await db.inventory.create({ data: { variantId: variant.id, quantity: stock } });
        created.inventories.push(inventory.id);
        return { variantId: variant.id, price };
    }

    async function makeCart(userId: string, items: Array<{ variantId: string; quantity: number }>): Promise<string> {
        const cart = await db.cart.create({ data: { userId, items: { create: items } } });
        created.carts.push(cart.id);
        return cart.id;
    }

    function checkout(auth: Auth, idempotencyKey: string, address = shippingAddress) {
        return request(app)
            .post("/api/v1/checkout")
            .set("Cookie", auth.cookie)
            .set("x-csrf-token", auth.csrfToken)
            .set("Idempotency-Key", idempotencyKey)
            .send({ shippingAddress: address });
    }

    async function stockOf(variantId: string): Promise<number> {
        return (await db.inventory.findUniqueOrThrow({ where: { variantId } })).quantity;
    }

    it("creates exactly one order with server-side prices, reduces stock and empties the cart", async () => {
        const user = await makeCustomer();
        const product = await makeProduct(4, "39.95");
        const cartId = await makeCart(user.userId, [{ variantId: product.variantId, quantity: 2 }]);
        const response = await checkout(user, uniqueKey());
        expect(response.status).toBe(201);
        expect(response.body.data.replayed).toBe(false);
        expect(response.body.data.order.subtotal).toBe("79.90");
        expect(response.body.data.order.total).toBe("79.90");
        expect(response.body.data.order.paymentStatus).toBe("UNPAID");
        expect(response.body.data.order.items).toHaveLength(1);
        expect(response.body.data.order.items[0].unitPrice).toBe("39.95");
        expect(await stockOf(product.variantId)).toBe(2);
        expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
        expect(await db.order.count({ where: { userId: user.userId } })).toBe(1);
    });

    it("replays the same idempotency key without creating another order or decrementing stock", async () => {
        const user = await makeCustomer();
        const product = await makeProduct(3);
        await makeCart(user.userId, [{ variantId: product.variantId, quantity: 1 }]);
        const key = uniqueKey();
        const first = await checkout(user, key);
        const replay = await checkout(user, key);
        expect(first.status).toBe(201);
        expect(replay.status).toBe(200);
        expect(replay.body.data.replayed).toBe(true);
        expect(replay.body.data.order.id).toBe(first.body.data.order.id);
        expect(await db.order.count({ where: { userId: user.userId } })).toBe(1);
        expect(await stockOf(product.variantId)).toBe(2);
    });

    it("rejects reuse of an idempotency key with a different shipping address", async () => {
        const user = await makeCustomer();
        const product = await makeProduct(3);
        await makeCart(user.userId, [{ variantId: product.variantId, quantity: 1 }]);
        const key = uniqueKey();
        expect((await checkout(user, key)).status).toBe(201);
        const changedAddress = { ...shippingAddress, district: "Besiktas" };
        expect((await checkout(user, key, changedAddress)).status).toBe(409);
        expect(await stockOf(product.variantId)).toBe(2);
        expect(await db.order.count({ where: { userId: user.userId } })).toBe(1);
    });

    it("rolls back all changes when one of multiple cart items has insufficient stock", async () => {
        const user = await makeCustomer();
        const available = await makeProduct(5);
        const unavailable = await makeProduct(0);
        const cartId = await makeCart(user.userId, [
            { variantId: available.variantId, quantity: 2 },
            { variantId: unavailable.variantId, quantity: 1 },
        ]);
        const response = await checkout(user, uniqueKey());
        expect(response.status).toBe(409);
        expect(await stockOf(available.variantId)).toBe(5);
        expect(await stockOf(unavailable.variantId)).toBe(0);
        expect(await db.cartItem.count({ where: { cartId } })).toBe(2);
        expect(await db.order.count({ where: { userId: user.userId } })).toBe(0);
    });

    it("prevents two concurrent customers from purchasing the final single unit", async () => {
        const a = await makeCustomer();
        const b = await makeCustomer();
        const product = await makeProduct(1);
        await makeCart(a.userId, [{ variantId: product.variantId, quantity: 1 }]);
        await makeCart(b.userId, [{ variantId: product.variantId, quantity: 1 }]);
        const results = await Promise.all([checkout(a, uniqueKey()), checkout(b, uniqueKey())]);
        expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
        expect(await stockOf(product.variantId)).toBe(0);
        expect(await db.order.count({ where: { userId: { in: [a.userId, b.userId] } } })).toBe(1);
    });

    it("allows just one checkout when the same cart is submitted concurrently with different keys", async () => {
        const user = await makeCustomer();
        const product = await makeProduct(4);
        const cartId = await makeCart(user.userId, [{ variantId: product.variantId, quantity: 1 }]);
        const results = await Promise.all([checkout(user, uniqueKey()), checkout(user, uniqueKey())]);
        expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
        expect(await stockOf(product.variantId)).toBe(3);
        expect(await db.order.count({ where: { userId: user.userId } })).toBe(1);
        expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
    });

    it("scopes idempotency keys by user rather than globally", async () => {
        const a = await makeCustomer();
        const b = await makeCustomer();
        const product = await makeProduct(4);
        await makeCart(a.userId, [{ variantId: product.variantId, quantity: 1 }]);
        await makeCart(b.userId, [{ variantId: product.variantId, quantity: 1 }]);
        const sharedKey = uniqueKey();
        const first = await checkout(a, sharedKey);
        const second = await checkout(b, sharedKey);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.data.order.id).not.toBe(second.body.data.order.id);
        expect(await stockOf(product.variantId)).toBe(2);
    });
});
