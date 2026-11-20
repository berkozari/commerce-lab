import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Database-free HTTP and query-shape regression tests. The real auth,
// routing, CSRF, cart and order services run; only Prisma is mocked.
const db = vi.hoisted(() => ({
    findSession: vi.fn(),
    findUser: vi.fn(),
    findOrder: vi.fn(),
    countOrders: vi.fn(),
    listOrders: vi.fn(),
    findCart: vi.fn(),
    findGuestCart: vi.fn(),
    createCart: vi.fn(),
    updateCartItem: vi.fn(),
    transaction: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
    getPrisma: () => ({
        authSession: { findUnique: db.findSession },
        user: { findUnique: db.findUser },
        order: {
            findFirst: db.findOrder,
            count: db.countOrders,
            findMany: db.listOrders,
        },
        cart: {
            findFirst: db.findCart,
            findUnique: db.findGuestCart,
            create: db.createCart,
        },
        cartItem: { update: db.updateCartItem },
        $transaction: db.transaction,
    }),
}));

process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";

const { signAccessToken } = await import("../src/lib/auth-crypto.js");
const { ACCESS_COOKIE, CSRF_COOKIE } = await import("../src/lib/auth-cookies.js");
const { app } = await import("../src/app.js");

const customerId = randomUUID();
const adminId = randomUUID();
const sessionId = randomUUID();
const orderId = randomUUID();
const itemId = randomUUID();
const cartId = randomUUID();

function actAs(userId: string, role: "CUSTOMER" | "ADMIN"): void {
    db.findSession.mockResolvedValue({
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 120_000),
    });
    db.findUser.mockResolvedValue({
        id: userId, name: "Example", email: "example@test.invalid", role,
    });
}

async function accessCookie(userId: string): Promise<string> {
    return `${ACCESS_COOKIE}=${await signAccessToken(userId, sessionId)}`;
}

async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(app).get("/api/v1/auth/csrf");
    expect(response.status).toBe(200);
    const setCookies = response.headers["set-cookie"] as unknown as string[];
    const cookie = setCookies.find((item) => item.startsWith(`${CSRF_COOKIE}=`));
    expect(cookie).toBeDefined();
    return { cookie: cookie!.split(";")[0]!, token: response.body.data.csrfToken as string };
}

beforeEach(() => {
    vi.clearAllMocks();
    db.countOrders.mockResolvedValue(0);
    db.listOrders.mockResolvedValue([]);
    db.findOrder.mockResolvedValue(null);
    db.findCart.mockResolvedValue({ id: cartId, userId: customerId, items: [] });
    db.findGuestCart.mockResolvedValue(null);
    db.createCart.mockResolvedValue({ id: cartId, items: [] });
    db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        order: { findFirst: db.findOrder },
        cart: { findFirst: db.findCart, findUnique: db.findGuestCart, create: db.createCart },
        cartItem: { update: db.updateCartItem },
    }));
});

describe("EC-013.4.1: admin authorization boundary", () => {
    it.each([
        "/api/v1/admin/products",
        `/api/v1/admin/products/${randomUUID()}`,
        "/api/v1/admin/orders",
    ])("rejects anonymous admin reads with 401: %s", async (path) => {
        expect((await request(app).get(path)).status).toBe(401);
    });

    it.each([
        "/api/v1/admin/products",
        `/api/v1/admin/products/${randomUUID()}`,
        "/api/v1/admin/orders",
    ])("rejects a signed CUSTOMER on admin reads with 403: %s", async (path) => {
        actAs(customerId, "CUSTOMER");
        const result = await request(app).get(path).set("Cookie", await accessCookie(customerId));
        expect(result.status).toBe(403);
        expect(result.body.message).toBe("Forbidden");
        expect(db.countOrders).not.toHaveBeenCalled();
    });

    it("blocks CUSTOMER admin mutations before any database operation", async () => {
        actAs(customerId, "CUSTOMER");
        const response = await request(app).patch(`/api/v1/admin/orders/${orderId}/status`)
            .set("Cookie", await accessCookie(customerId))
            .send({ status: "SHIPPED" });
        expect(response.status).toBe(403);
        expect(db.findOrder).not.toHaveBeenCalled();
    });

    it("permits an authenticated ADMIN to list orders", async () => {
        actAs(adminId, "ADMIN");
        const response = await request(app).get("/api/v1/admin/orders")
            .set("Cookie", await accessCookie(adminId));
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ items: [], total: 0 });
        expect(db.countOrders).toHaveBeenCalledOnce();
    });
});

describe("EC-013.4.1: order ownership boundary", () => {
    it("rejects anonymous access to customer order reads", async () => {
        expect((await request(app).get("/api/v1/orders")).status).toBe(401);
        expect((await request(app).get(`/api/v1/orders/${orderId}`)).status).toBe(401);
    });

    it("scopes customer order lists and counts to the authenticated user", async () => {
        actAs(customerId, "CUSTOMER");
        const response = await request(app).get("/api/v1/orders?page=1&limit=10")
            .set("Cookie", await accessCookie(customerId));
        expect(response.status).toBe(200);
        expect(db.countOrders).toHaveBeenCalledWith({ where: { userId: customerId } });
        expect(db.listOrders).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: customerId },
            skip: 0, take: 10,
        }));
    });

    it("returns 404 for a missing or non-owned order and preserves owner filtering", async () => {
        actAs(customerId, "CUSTOMER");
        const response = await request(app).get(`/api/v1/orders/${orderId}`)
            .set("Cookie", await accessCookie(customerId));
        expect(response.status).toBe(404);
        expect(db.findOrder).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: orderId, userId: customerId },
        }));
    });

    it("refuses a demo payment on a non-owned order before changing its state", async () => {
        actAs(customerId, "CUSTOMER");
        const challenge = await csrf();
        const response = await request(app).post(`/api/v1/orders/${orderId}/demo-payment`)
            .set("Cookie", [await accessCookie(customerId), challenge.cookie])
            .set("x-csrf-token", challenge.token)
            .send({ outcome: "success" });
        expect(response.status).toBe(404);
        expect(db.findOrder).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: orderId, userId: customerId },
        }));
    });

    it("validates order identifiers before querying stored orders", async () => {
        actAs(customerId, "CUSTOMER");
        const response = await request(app).get("/api/v1/orders/not-a-uuid")
            .set("Cookie", await accessCookie(customerId));
        expect(response.status).toBe(400);
        expect(db.findOrder).not.toHaveBeenCalled();
    });
});

describe("EC-013.4.1: cart ownership boundary", () => {
    it("selects the logged-in user's cart, not a client-supplied cart ID", async () => {
        actAs(customerId, "CUSTOMER");
        const response = await request(app).get("/api/v1/cart")
            .set("Cookie", await accessCookie(customerId));
        expect(response.status).toBe(200);
        expect(db.findCart).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: customerId },
        }));
    });

    it("returns 404 rather than updating an item outside the user's cart", async () => {
        actAs(customerId, "CUSTOMER");
        const challenge = await csrf();
        const response = await request(app).patch(`/api/v1/cart/items/${itemId}`)
            .set("Cookie", [await accessCookie(customerId), challenge.cookie])
            .set("x-csrf-token", challenge.token)
            .send({ quantity: 2 });
        expect(response.status).toBe(404);
        expect(db.findCart).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: customerId },
        }));
        expect(db.updateCartItem).not.toHaveBeenCalled();
    });

    it("does not fall back to a guest cart for an invalid signed-in cookie", async () => {
        const response = await request(app).get("/api/v1/cart")
            .set("Cookie", `${ACCESS_COOKIE}=invalid.jwt.value`);
        expect(response.status).toBe(401);
        expect(db.findCart).not.toHaveBeenCalled();
        expect(db.createCart).not.toHaveBeenCalled();
    });
});
