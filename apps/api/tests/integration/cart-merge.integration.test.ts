import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in, real-PostgreSQL suite. Ordinary pnpm test runs must never write to a DB.
const isolatedDatabaseUrl = process.env.EC013_CHECKOUT_TEST_DATABASE_URL;

function assertIsolatedDatabase(value: string): void {
    const url = new URL(value);
    if (
        !["postgresql:", "postgres:"].includes(url.protocol) ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "5433" ||
        url.username !== "commercelab" ||
        url.pathname !== "/commercelab_checkout_test" ||
        url.hash !== "" ||
        [...url.searchParams.keys()].some((key) => key !== "schema") ||
        (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")
    ) {
        throw new Error("EC-014.3.3 refuses any database except local commercelab_checkout_test on port 5433");
    }
}

type Database = ReturnType<typeof import("../../src/config/database.js")["getPrisma"]>;
type Application = typeof import("../../src/app.js")["app"];
type Identity = { userId: string; cookie: string; csrfToken: string };

describe.skipIf(!isolatedDatabaseUrl)("EC-014.3.3: cart merge and PostgreSQL transaction safety", () => {
    let db: Database;
    let app: Application;
    let disconnect: () => Promise<void>;
    let categoryId: string | undefined;
    let accessCookieName: string;
    let csrfCookieName: string;
    let guestCookieName: string;
    let newGuestToken: () => string;
    let guestTokenHash: (token: string) => string;

    const created = {
        users: [] as string[],
        sessions: [] as string[],
        products: [] as string[],
        variants: [] as string[],
        inventories: [] as string[],
        carts: [] as string[],
    };

    beforeAll(async () => {
        // Guard before importing database/application code or creating any fixtures.
        assertIsolatedDatabase(isolatedDatabaseUrl!);
        process.env.DATABASE_URL = isolatedDatabaseUrl!;
        process.env.NODE_ENV = "test";
        process.env.AUTH_JWT_SECRET = "ec014-cart-merge-only-jwt-secret-never-for-production";
        process.env.AUTH_CSRF_SECRET = "ec014-cart-merge-only-csrf-secret-never-for-production";
        process.env.CORS_ORIGIN = "http://127.0.0.1:5173";

        const database = await import("../../src/config/database.js");
        db = database.getPrisma();
        disconnect = database.disconnectDatabase;
        const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
        if (actual[0]?.name !== "commercelab_checkout_test") {
            throw new Error("EC-014.3.3 refuses to write to an unexpected PostgreSQL database");
        }

        ({ app } = await import("../../src/app.js"));
        ({ ACCESS_COOKIE: accessCookieName, CSRF_COOKIE: csrfCookieName } = await import("../../src/lib/auth-cookies.js"));
        ({ GUEST_CART_COOKIE: guestCookieName, newGuestToken, guestTokenHash } = await import("../../src/lib/cart-cookie.js"));

        const category = await db.category.create({
            data: { name: "EC014 Cart Merge Isolation", slug: `ec014-cart-merge-${randomUUID()}` },
        });
        categoryId = category.id;
    }, 30_000);

    afterAll(async () => {
        if (!db) return;
        try {
            // Scope cleanup exclusively to this suite's generated IDs; no TRUNCATE or reset.
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

    async function makeUser(): Promise<Identity> {
        const user = await db.user.create({
            data: {
                name: "EC014 Merge Customer",
                email: `ec014-merge-${randomUUID()}@example.invalid`,
                passwordHash: "integration-fixture-not-a-login-password",
                role: "CUSTOMER",
            },
        });
        created.users.push(user.id);

        const sessionId = randomUUID();
        const { hashToken, signAccessToken } = await import("../../src/lib/auth-crypto.js");
        await db.authSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshTokenHash: hashToken(`fixture-${randomUUID()}`),
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

    async function makeVariant(stock: number): Promise<string> {
        if (!categoryId) throw new Error("Test category not initialized");
        const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
        const product = await db.product.create({
            data: {
                categoryId,
                name: `Cart Merge Product ${suffix}`,
                slug: `ec014-merge-product-${suffix}`,
                status: "ACTIVE",
            },
        });
        created.products.push(product.id);

        const variant = await db.productVariant.create({
            data: {
                productId: product.id,
                name: "Standard",
                sku: `EC014-MERGE-${suffix}`,
                price: "12.50",
                currency: "TRY",
                isActive: true,
            },
        });
        created.variants.push(variant.id);
        const inventory = await db.inventory.create({ data: { variantId: variant.id, quantity: stock } });
        created.inventories.push(inventory.id);
        return variant.id;
    }

    type ItemInput = { variantId: string; quantity: number; createdAt?: Date };

    async function makeUserCart(userId: string, items: ItemInput[]) {
        const cart = await db.cart.create({ data: { userId, items: { create: items } } });
        created.carts.push(cart.id);
        return cart;
    }

    async function makeGuestCart(token: string, items: ItemInput[]) {
        const cart = await db.cart.create({ data: { guestTokenHash: guestTokenHash(token), items: { create: items } } });
        created.carts.push(cart.id);
        return cart;
    }

    async function postMerge(identity: Identity, guestToken?: string) {
        const cookie = guestToken ? `${identity.cookie}; ${guestCookieName}=${guestToken}` : identity.cookie;
        return request(app)
            .post("/api/v1/cart/merge")
            .set("Cookie", cookie)
            .set("x-csrf-token", identity.csrfToken)
            .send({});
    }

    function guestCookieWasCleared(response: Awaited<ReturnType<typeof postMerge>>): boolean {
        const headers = response.headers["set-cookie"] as string[] | string | undefined;
        const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
        return values.some((value) => value.startsWith(`${guestCookieName}=`) && value.includes("Path=/api/v1/cart"));
    }

    it("merges matching and guest-only variants atomically and deletes only the guest cart", async () => {
        const identity = await makeUser();
        const matching = await makeVariant(50);
        const guestOnly = await makeVariant(30);
        const token = newGuestToken();
        const userCart = await makeUserCart(identity.userId, [{ variantId: matching, quantity: 2 }]);
        const guestCart = await makeGuestCart(token, [
            { variantId: matching, quantity: 3 },
            { variantId: guestOnly, quantity: 2 },
        ]);

        const response = await postMerge(identity, token);
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: userCart.id, itemCount: 7, availableSubtotal: "87.50" });
        expect(guestCookieWasCleared(response)).toBe(true);
        const items = await db.cartItem.findMany({ where: { cartId: userCart.id } });
        expect(items).toHaveLength(2);
        expect(items.find((item) => item.variantId === matching)?.quantity).toBe(5);
        expect(items.find((item) => item.variantId === guestOnly)?.quantity).toBe(2);
        expect(await db.cart.count({ where: { id: guestCart.id } })).toBe(0);
        expect((await db.inventory.findUniqueOrThrow({ where: { variantId: matching } })).quantity).toBe(50);
    });

    it("rolls back an earlier item update when a later guest item lacks stock", async () => {
        const identity = await makeUser();
        const available = await makeVariant(50);
        const unavailable = await makeVariant(2);
        const token = newGuestToken();
        const userCart = await makeUserCart(identity.userId, [{ variantId: available, quantity: 2 }]);
        const guestCart = await makeGuestCart(token, [
            { variantId: available, quantity: 3, createdAt: new Date(Date.now() - 60_000) },
            { variantId: unavailable, quantity: 3, createdAt: new Date() },
        ]);

        const response = await postMerge(identity, token);
        expect(response.status).toBe(409);
        expect(guestCookieWasCleared(response)).toBe(false);
        const userItems = await db.cartItem.findMany({ where: { cartId: userCart.id } });
        expect(userItems).toHaveLength(1);
        expect(userItems[0]?.quantity).toBe(2); // Prior update must have been rolled back.
        expect(await db.cartItem.count({ where: { cartId: guestCart.id } })).toBe(2);
        expect(await db.cart.count({ where: { id: guestCart.id } })).toBe(1);
    });

    it("rejects a total quantity above 100 without changing either cart", async () => {
        const identity = await makeUser();
        const variantId = await makeVariant(200);
        const token = newGuestToken();
        const userCart = await makeUserCart(identity.userId, [{ variantId, quantity: 90 }]);
        const guestCart = await makeGuestCart(token, [{ variantId, quantity: 11 }]);

        const response = await postMerge(identity, token);
        expect(response.status).toBe(409);
        expect(guestCookieWasCleared(response)).toBe(false);
        expect((await db.cartItem.findFirstOrThrow({ where: { cartId: userCart.id } })).quantity).toBe(90);
        expect((await db.cartItem.findFirstOrThrow({ where: { cartId: guestCart.id } })).quantity).toBe(11);
        expect(await db.cart.count({ where: { id: guestCart.id } })).toBe(1);
    });

    it("treats a valid guest token without a stored cart as a no-op and clears the cookie", async () => {
        const identity = await makeUser();
        const variantId = await makeVariant(20);
        const userCart = await makeUserCart(identity.userId, [{ variantId, quantity: 2 }]);
        const unusedToken = newGuestToken();

        const response = await postMerge(identity, unusedToken);
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: userCart.id, itemCount: 2 });
        expect(guestCookieWasCleared(response)).toBe(true);
        expect((await db.cartItem.findFirstOrThrow({ where: { cartId: userCart.id } })).quantity).toBe(2);
        expect(await db.cart.count({ where: { guestTokenHash: guestTokenHash(unusedToken) } })).toBe(0);
    });

    it("does not merge the same guest cart twice when a stale guest cookie is reused", async () => {
        const identity = await makeUser();
        const variantId = await makeVariant(30);
        const token = newGuestToken();
        const userCart = await makeUserCart(identity.userId, [{ variantId, quantity: 2 }]);
        const guestCart = await makeGuestCart(token, [{ variantId, quantity: 3 }]);

        const first = await postMerge(identity, token);
        const second = await postMerge(identity, token); // Simulate a client replaying its old cookie.
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.body.data.itemCount).toBe(5);
        expect(second.body.data.itemCount).toBe(5);
        expect((await db.cartItem.findFirstOrThrow({ where: { cartId: userCart.id } })).quantity).toBe(5);
        expect(await db.cart.count({ where: { id: guestCart.id } })).toBe(0);
    });
});
