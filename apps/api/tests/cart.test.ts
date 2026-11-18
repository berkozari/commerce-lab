import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client.js";
import { cartItemCreateSchema, cartItemUpdateSchema, cartItemIdSchema } from "../src/schemas/cart.schema.js";
import { guestTokenHash, newGuestToken } from "../src/lib/cart-cookie.js";
import { cartSnapshot } from "../src/services/cart.service.js";
import type { CartWithItems } from "../src/repositories/cart.repository.js";

let app: typeof import("../src/app.js")["app"];
beforeAll(async () => {
    process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
    process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";
    ({ app } = await import("../src/app.js"));
});

const variantId = "550e8400-e29b-41d4-a716-446655440000";

describe("Cart validation and cookie utilities (database-free)", () => {
    it("requires UUID variant, positive integer quantity, and rejects unknown keys", () => {
        expect(cartItemCreateSchema.safeParse({ variantId, quantity: 1 }).success).toBe(true);
        expect(cartItemCreateSchema.safeParse({ variantId, quantity: 0 }).success).toBe(false);
        expect(cartItemCreateSchema.safeParse({ variantId, quantity: 1.2 }).success).toBe(false);
        expect(cartItemCreateSchema.safeParse({ variantId, quantity: 101 }).success).toBe(false);
        expect(cartItemCreateSchema.safeParse({ variantId, quantity: 1, price: "0.01" }).success).toBe(false);
        expect(cartItemUpdateSchema.safeParse({ quantity: 3 }).success).toBe(true);
        expect(cartItemIdSchema.safeParse("not-a-uuid").success).toBe(false);
    });
    it("generates unpredictable tokens and stable non-reversible hashes", () => {
        const token1 = newGuestToken();
        const token2 = newGuestToken();
        expect(token1).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(token1).not.toBe(token2);
        expect(guestTokenHash(token1)).toBe(guestTokenHash(token1));
        expect(guestTokenHash(token1)).not.toBe(guestTokenHash(token2));
        expect(guestTokenHash(token1)).not.toContain(token1);
    });
    it("computes totals using decimal arithmetic; excludes unavailable lines", () => {
        const item = (price: string, quantity: number, stock: number) => ({
            id: variantId, variantId, quantity,
            variant: {
                sku: "SKU-1", name: "Standard", price: new Prisma.Decimal(price), currency: "TRY", isActive: true,
                product: { id: variantId, name: "Product", slug: "product", status: "ACTIVE" },
                inventory: { quantity: stock },
            },
        });
        const cart = { id: variantId, items: [item("0.10", 3, 10), item("12.99", 2, 0)] } as unknown as CartWithItems;
        const result = cartSnapshot(cart);
        expect(result.availableSubtotal).toBe("0.30");
        expect(result.items[0]?.lineTotal).toBe("0.30");
        expect(result.items[1]?.available).toBe(false);
        expect(result.itemCount).toBe(5);
    });
});

describe("Cart HTTP boundary (database-free)", () => {
    it("requires CSRF for all mutations before database access", async () => {
        const endpoints = [
            ["post", "/api/v1/cart/items"],
            ["patch", `/api/v1/cart/items/${variantId}`],
            ["delete", `/api/v1/cart/items/${variantId}`],
            ["delete", "/api/v1/cart"],
            ["post", "/api/v1/cart/merge"],
        ] as const;
        for (const [method, path] of endpoints) {
            const response = await request(app)[method](path);
            expect(response.status).toBe(403);
        }
    });
});
