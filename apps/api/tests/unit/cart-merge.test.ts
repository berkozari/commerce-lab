import { beforeEach, describe, expect, it, vi } from "vitest";
import { cartFixture, cartFixtureItem } from "../helpers/cart.fixtures.js";

const mock = vi.hoisted(() => ({
    ensureCart: vi.fn(),
    findCart: vi.fn(),
    tx: {
        productVariant: { findUnique: vi.fn() },
        cartItem: { update: vi.fn(), create: vi.fn() },
        cart: { delete: vi.fn(), findUniqueOrThrow: vi.fn() },
    },
}));

// Exercise the real service business rules, without opening a PostgreSQL connection.
// This fake transaction does NOT simulate commit/rollback; rollback belongs in DB integration tests.
vi.mock("../../src/repositories/cart.repository.js", () => ({
    ensureCart: mock.ensureCart,
    findCart: mock.findCart,
    cartInclude: { items: true },
    cartTransaction: (fn: (tx: typeof mock.tx) => Promise<unknown>) => fn(mock.tx),
}));

const { cartService } = await import("../../src/services/cart.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const userCartId = "22222222-2222-4222-8222-222222222222";
const guestCartId = "33333333-3333-4333-8333-333333333333";
const variantId = "44444444-4444-4444-8444-444444444444";
const secondVariantId = "55555555-5555-4555-8555-555555555555";
const tokenHash = "fixture-guest-token-hash";

function purchasableVariant(overrides: {
    isActive?: boolean;
    productStatus?: string;
    currency?: string;
    stock?: number | null;
} = {}) {
    return {
        isActive: overrides.isActive ?? true,
        currency: overrides.currency ?? "TRY",
        product: { status: overrides.productStatus ?? "ACTIVE" },
        inventory: overrides.stock === null ? null : { quantity: overrides.stock ?? 200 },
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    mock.ensureCart.mockResolvedValue(cartFixture(userCartId));
    mock.findCart.mockResolvedValue(cartFixture(guestCartId));
    mock.tx.productVariant.findUnique.mockResolvedValue(purchasableVariant());
    mock.tx.cart.findUniqueOrThrow.mockResolvedValue(cartFixture(userCartId));
    mock.tx.cart.delete.mockResolvedValue({ id: guestCartId });
    mock.tx.cartItem.update.mockResolvedValue({});
    mock.tx.cartItem.create.mockResolvedValue({});
});

describe("cartService.merge business rules (database-free)", () => {
    it("returns the existing user cart when no guest token is supplied", async () => {
        const result = await cartService.merge(userId, undefined);

        expect(result.id).toBe(userCartId);
        expect(mock.ensureCart).toHaveBeenCalledWith(mock.tx, { kind: "user", userId });
        expect(mock.findCart).not.toHaveBeenCalled();
        expect(mock.tx.cart.delete).not.toHaveBeenCalled();
    });

    it("leaves the user cart unchanged if the guest cart cannot be found", async () => {
        mock.findCart.mockResolvedValue(null);

        const result = await cartService.merge(userId, tokenHash);

        expect(result.id).toBe(userCartId);
        expect(mock.findCart).toHaveBeenCalledWith(mock.tx, { kind: "guest", tokenHash });
        expect(mock.tx.cartItem.create).not.toHaveBeenCalled();
        expect(mock.tx.cart.delete).not.toHaveBeenCalled();
    });

    it("does not delete a cart if the guest and user cart IDs are identical", async () => {
        mock.findCart.mockResolvedValue(cartFixture(userCartId));

        const result = await cartService.merge(userId, tokenHash);

        expect(result.id).toBe(userCartId);
        expect(mock.tx.cart.delete).not.toHaveBeenCalled();
    });

    it("combines quantities of an already-present variant and then deletes the guest cart", async () => {
        mock.ensureCart.mockResolvedValue(cartFixture(userCartId, [cartFixtureItem(variantId, 2)]));
        mock.findCart.mockResolvedValue(cartFixture(guestCartId, [cartFixtureItem(variantId, 3)]));
        mock.tx.cart.findUniqueOrThrow.mockResolvedValue(cartFixture(userCartId, [cartFixtureItem(variantId, 5)]));

        const result = await cartService.merge(userId, tokenHash);

        expect(mock.tx.productVariant.findUnique).toHaveBeenCalledWith({
            where: { id: variantId }, include: { product: true, inventory: true },
        });
        expect(mock.tx.cartItem.update).toHaveBeenCalledWith({
            where: { id: `item-${variantId}` }, data: { quantity: 5 },
        });
        expect(mock.tx.cartItem.create).not.toHaveBeenCalled();
        expect(mock.tx.cart.delete).toHaveBeenCalledWith({ where: { id: guestCartId } });
        expect(result).toMatchObject({ id: userCartId, itemCount: 5, availableSubtotal: "62.50" });
    });

    it("creates a new cart item for a guest-only variant before removing the guest cart", async () => {
        mock.findCart.mockResolvedValue(cartFixture(guestCartId, [cartFixtureItem(secondVariantId, 2)]));
        mock.tx.cart.findUniqueOrThrow.mockResolvedValue(cartFixture(userCartId, [cartFixtureItem(secondVariantId, 2)]));

        const result = await cartService.merge(userId, tokenHash);

        expect(mock.tx.cartItem.create).toHaveBeenCalledWith({
            data: { cartId: userCartId, variantId: secondVariantId, quantity: 2 },
        });
        expect(mock.tx.cartItem.update).not.toHaveBeenCalled();
        expect(mock.tx.cartItem.create.mock.invocationCallOrder[0])
            .toBeLessThan(mock.tx.cart.delete.mock.invocationCallOrder[0]);
        expect(result.itemCount).toBe(2);
    });

    it("rejects a merged quantity above 100 without writing or removing the guest cart", async () => {
        mock.ensureCart.mockResolvedValue(cartFixture(userCartId, [cartFixtureItem(variantId, 95)]));
        mock.findCart.mockResolvedValue(cartFixture(guestCartId, [cartFixtureItem(variantId, 6)]));

        await expect(cartService.merge(userId, tokenHash)).rejects.toMatchObject({ statusCode: 409 });
        expect(mock.tx.productVariant.findUnique).not.toHaveBeenCalled();
        expect(mock.tx.cartItem.update).not.toHaveBeenCalled();
        expect(mock.tx.cartItem.create).not.toHaveBeenCalled();
        expect(mock.tx.cart.delete).not.toHaveBeenCalled();
    });

    const invalidVariants: Array<[string, Parameters<typeof purchasableVariant>[0]]> = [
        ["inactive variant", { isActive: false }],
        ["archived product", { productStatus: "ARCHIVED" }],
        ["unsupported currency", { currency: "USD" }],
        ["insufficient stock", { stock: 1 }],
        ["missing inventory", { stock: null }],
    ];

    it.each(invalidVariants)("rejects %s without deleting the guest cart", async (name, variant) => {
        void name;
        mock.findCart.mockResolvedValue(cartFixture(guestCartId, [cartFixtureItem(variantId, 2)]));
        mock.tx.productVariant.findUnique.mockResolvedValue(purchasableVariant(variant));

        await expect(cartService.merge(userId, tokenHash)).rejects.toMatchObject({ statusCode: 409 });
        expect(mock.tx.cartItem.update).not.toHaveBeenCalled();
        expect(mock.tx.cartItem.create).not.toHaveBeenCalled();
        expect(mock.tx.cart.delete).not.toHaveBeenCalled();
    });
});
