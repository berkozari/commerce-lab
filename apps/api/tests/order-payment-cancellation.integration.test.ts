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
        throw new Error("EC-013.6.2: expected local port 5433, user commercelab, database commercelab_checkout_test");
    }
}

type PrismaClient = ReturnType<typeof import("../src/config/database.js")["getPrisma"]>;
type App = typeof import("../src/app.js")["app"];
type Auth = { userId: string; cookie: string; csrfToken: string; role: "CUSTOMER" | "ADMIN" };
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
describe.skipIf(!isolatedDatabaseUrl)("EC-013.6.2: real DB payment and cancellation security", () => {
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
        process.env.AUTH_JWT_SECRET = "ec013-payment-test-only-jwt-secret-never-for-production";
        process.env.AUTH_CSRF_SECRET = "ec013-payment-test-only-csrf-secret-never-for-production";
        process.env.CORS_ORIGIN = "http://127.0.0.1:5173";

        const databaseModule = await import("../src/config/database.js");
        db = databaseModule.getPrisma();
        disconnect = databaseModule.disconnectDatabase;

        // Second guard: confirm the PostgreSQL server's actual database name.
        const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
        if (actual[0]?.name !== "commercelab_checkout_test") {
            throw new Error("EC-013.6.2 refuses to write to unexpected database");
        }

        ({ app } = await import("../src/app.js"));
        const cookieModule = await import("../src/lib/auth-cookies.js");
        accessCookieName = cookieModule.ACCESS_COOKIE;
        csrfCookieName = cookieModule.CSRF_COOKIE;
        const category = await db.category.create({
            data: { name: "EC013 Payment Isolation", slug: `ec013-payment-${randomUUID()}` },
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

    async function makeUser(role: "CUSTOMER" | "ADMIN" = "CUSTOMER"): Promise<Auth> {
        const user = await db.user.create({
            data: {
                name: "EC013 Payment Customer",
                email: `ec013-payment-${randomUUID()}@example.invalid`,
                passwordHash: "test-fixture-not-for-login",
                role,
            },
        });
        created.users.push(user.id);
        const sessionId = randomUUID();
        const { createRefreshToken, hashToken, signAccessToken } = await import("../src/lib/auth-crypto.js");
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
            role,
            cookie: `${accessCookieName}=${await signAccessToken(user.id, sessionId)}; ${csrfCookieName}=${csrfToken}`,
            csrfToken,
        };
    }

    async function makeProduct(stock: number, price = "39.95"): Promise<ProductFixture> {
        const suffix = randomUUID().replace(/-/g, "").slice(0, 15);
        const product = await db.product.create({
            data: {
                categoryId,
                name: `Payment Product ${suffix}`,
                slug: `payment-product-${suffix}`,
                status: "ACTIVE",
            },
        });
        created.products.push(product.id);
        const variant = await db.productVariant.create({
            data: {
                productId: product.id,
                sku: `EC013-PAY-${suffix}`,
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

    async function makeOrder(user: Auth, stock = 3, quantity = 1) {
        const product = await makeProduct(stock);
        await makeCart(user.userId, [{ variantId: product.variantId, quantity }]);
        const response = await checkout(user, uniqueKey());
        expect(response.status).toBe(201);
        expect(response.body.data.order.status).toBe("PENDING");
        expect(response.body.data.order.paymentStatus).toBe("UNPAID");
        return { orderId: response.body.data.order.id as string, variantId: product.variantId, originalStock: stock, quantity };
    }

    function pay(user: Auth, orderId: string, outcome: "success" | "failure") {
        return request(app)
            .post(`/api/v1/orders/${orderId}/demo-payment`)
            .set("Cookie", user.cookie)
            .set("x-csrf-token", user.csrfToken)
            .send({ outcome });
    }

    function adminStatus(user: Auth, orderId: string, status: "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED") {
        return request(app)
            .patch(`/api/v1/admin/orders/${orderId}/status`)
            .set("Cookie", user.cookie)
            .set("x-csrf-token", user.csrfToken)
            .send({ status });
    }

    async function persistedOrder(orderId: string) {
        return db.order.findUniqueOrThrow({ where: { id: orderId } });
    }

    it("confirms a successful demo payment without a second stock deduction", async () => {
        const customer = await makeUser();
        const fixture = await makeOrder(customer, 4, 2);
        expect(await stockOf(fixture.variantId)).toBe(2);

        const response = await pay(customer, fixture.orderId, "success");
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe("CONFIRMED");
        expect(response.body.data.paymentStatus).toBe("PAID_DEMO");
        expect(await stockOf(fixture.variantId)).toBe(2);
    });

    it("makes repeated successful demo payments idempotent", async () => {
        const customer = await makeUser();
        const fixture = await makeOrder(customer, 3);
        const first = await pay(customer, fixture.orderId, "success");
        const second = await pay(customer, fixture.orderId, "success");
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.data.status).toBe("CONFIRMED");
        expect(second.body.data.paymentStatus).toBe("PAID_DEMO");
        expect(await stockOf(fixture.variantId)).toBe(2);
    });

    it("cancels a failed demo payment and restores inventory exactly once", async () => {
        const customer = await makeUser();
        const fixture = await makeOrder(customer, 5, 2);
        expect(await stockOf(fixture.variantId)).toBe(3);
        const first = await pay(customer, fixture.orderId, "failure");
        const second = await pay(customer, fixture.orderId, "failure");
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.data.status).toBe("CANCELLED");
        expect(second.body.data.paymentStatus).toBe("UNPAID");
        expect(await stockOf(fixture.variantId)).toBe(5);
    });

    it("rejects payment after cancellation and rejects failure after successful payment", async () => {
        const customer = await makeUser();
        const cancelled = await makeOrder(customer, 3);
        expect((await pay(customer, cancelled.orderId, "failure")).status).toBe(200);
        expect((await pay(customer, cancelled.orderId, "success")).status).toBe(409);
        expect((await persistedOrder(cancelled.orderId)).status).toBe("CANCELLED");
        expect(await stockOf(cancelled.variantId)).toBe(3);

        const otherCustomer = await makeUser();
        const other = await makeOrder(otherCustomer, 4);
        expect((await pay(otherCustomer, other.orderId, "success")).status).toBe(200);
        expect((await pay(otherCustomer, other.orderId, "failure")).status).toBe(409);
        expect((await persistedOrder(other.orderId)).paymentStatus).toBe("PAID_DEMO");
        expect(await stockOf(other.variantId)).toBe(3);
    });

    it("returns 404 when a customer attempts to pay another customer's order", async () => {
        const owner = await makeUser();
        const stranger = await makeUser();
        const fixture = await makeOrder(owner, 2);
        const response = await pay(stranger, fixture.orderId, "success");
        expect(response.status).toBe(404);
        expect((await persistedOrder(fixture.orderId)).status).toBe("PENDING");
        expect(await stockOf(fixture.variantId)).toBe(1);
    });

    it("denies a CUSTOMER access to admin order status mutation", async () => {
        const customer = await makeUser();
        const fixture = await makeOrder(customer, 3);
        const response = await adminStatus(customer, fixture.orderId, "CANCELLED");
        expect(response.status).toBe(403);
        expect((await persistedOrder(fixture.orderId)).status).toBe("PENDING");
        expect(await stockOf(fixture.variantId)).toBe(2);
    });

    it("lets ADMIN cancel a pending order and restocks only once", async () => {
        const customer = await makeUser();
        const admin = await makeUser("ADMIN");
        const fixture = await makeOrder(customer, 4, 2);
        const first = await adminStatus(admin, fixture.orderId, "CANCELLED");
        const replay = await adminStatus(admin, fixture.orderId, "CANCELLED");
        expect(first.status).toBe(200);
        expect(replay.status).toBe(200);
        expect(replay.body.data.status).toBe("CANCELLED");
        expect(replay.body.data.paymentStatus).toBe("UNPAID");
        expect(await stockOf(fixture.variantId)).toBe(4);
    });

    it("refunds a confirmed paid order on admin cancellation and restores inventory once", async () => {
        const customer = await makeUser();
        const admin = await makeUser("ADMIN");
        const fixture = await makeOrder(customer, 5, 2);
        expect((await pay(customer, fixture.orderId, "success")).status).toBe(200);
        const cancelled = await adminStatus(admin, fixture.orderId, "CANCELLED");
        const replay = await adminStatus(admin, fixture.orderId, "CANCELLED");
        expect(cancelled.status).toBe(200);
        expect(replay.status).toBe(200);
        expect(replay.body.data.paymentStatus).toBe("REFUNDED_DEMO");
        expect(await stockOf(fixture.variantId)).toBe(5);
        expect((await pay(customer, fixture.orderId, "success")).status).toBe(409);
    });

    it("enforces paid fulfillment transitions and terminal delivered state", async () => {
        const customer = await makeUser();
        const admin = await makeUser("ADMIN");
        const fixture = await makeOrder(customer, 3);
        expect((await adminStatus(admin, fixture.orderId, "PROCESSING")).status).toBe(409);
        expect((await adminStatus(admin, fixture.orderId, "SHIPPED")).status).toBe(409);
        expect((await pay(customer, fixture.orderId, "success")).status).toBe(200);
        expect((await adminStatus(admin, fixture.orderId, "SHIPPED")).status).toBe(409);
        expect((await adminStatus(admin, fixture.orderId, "PROCESSING")).status).toBe(200);
        expect((await adminStatus(admin, fixture.orderId, "SHIPPED")).status).toBe(200);
        expect((await adminStatus(admin, fixture.orderId, "DELIVERED")).status).toBe(200);
        expect((await adminStatus(admin, fixture.orderId, "CANCELLED")).status).toBe(409);
        expect((await persistedOrder(fixture.orderId)).paymentStatus).toBe("PAID_DEMO");
        expect(await stockOf(fixture.variantId)).toBe(2);
    });

    it("serializes simultaneous successful and failed payment requests", async () => {
        const customer = await makeUser();
        const fixture = await makeOrder(customer, 2);
        const responses = await Promise.all([
            pay(customer, fixture.orderId, "success"),
            pay(customer, fixture.orderId, "failure"),
        ]);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
        const saved = await persistedOrder(fixture.orderId);
        if (saved.status === "CONFIRMED") {
            expect(saved.paymentStatus).toBe("PAID_DEMO");
            expect(await stockOf(fixture.variantId)).toBe(1);
        } else {
            expect(saved.status).toBe("CANCELLED");
            expect(saved.paymentStatus).toBe("UNPAID");
            expect(await stockOf(fixture.variantId)).toBe(2);
        }
    });

    it("does not restock twice for concurrent duplicate admin cancellation", async () => {
        const customer = await makeUser();
        const admin = await makeUser("ADMIN");
        const fixture = await makeOrder(customer, 2);
        expect((await pay(customer, fixture.orderId, "success")).status).toBe(200);
        const responses = await Promise.all([
            adminStatus(admin, fixture.orderId, "CANCELLED"),
            adminStatus(admin, fixture.orderId, "CANCELLED"),
        ]);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 200]);
        const saved = await persistedOrder(fixture.orderId);
        expect(saved.status).toBe("CANCELLED");
        expect(saved.paymentStatus).toBe("REFUNDED_DEMO");
        expect(await stockOf(fixture.variantId)).toBe(2);
    });
});
