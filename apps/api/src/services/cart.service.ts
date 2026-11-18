import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/app-error.js";
import type { CartIdentity } from "../middlewares/cart-identity.middleware.js";
import { cartInclude, cartTransaction, ensureCart, findCart } from "../repositories/cart.repository.js";
import type { CartWithItems } from "../repositories/cart.repository.js";
import type { CartItemCreateInput } from "../schemas/cart.schema.js";

type CartItem = CartWithItems["items"][number];

export function cartItemAvailability(item: CartItem): { available: boolean; reason: string | null } {
    if (item.variant.product.status !== "ACTIVE" || !item.variant.isActive) {
        return { available: false, reason: "Product is unavailable" };
    }
    if (!item.variant.inventory || item.variant.inventory.quantity < item.quantity) {
        return { available: false, reason: "Insufficient stock" };
    }
    return { available: true, reason: null };
}

export function cartSnapshot(cart: CartWithItems) {
    let availableSubtotal = new Prisma.Decimal(0);
    const items = cart.items.map((item) => {
        const availability = cartItemAvailability(item);
        const price = item.variant.price;
        const lineTotal = price.mul(item.quantity);
        if (availability.available) availableSubtotal = availableSubtotal.plus(lineTotal);
        return {
            id: item.id,
            variantId: item.variantId,
            quantity: item.quantity,
            sku: item.variant.sku,
            variantName: item.variant.name,
            product: { id: item.variant.product.id, name: item.variant.product.name, slug: item.variant.product.slug },
            unitPrice: price.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            currency: item.variant.currency,
            available: availability.available,
            unavailableReason: availability.reason,
        };
    });
    return {
        id: cart.id, items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        availableSubtotal: availableSubtotal.toFixed(2), currency: "TRY"
    };
}

async function mustBePurchasable(tx: Prisma.TransactionClient, variantId: string, quantity: number) {
    const variant = await tx.productVariant.findUnique({
        where: { id: variantId }, include: { product: true, inventory: true },
    });
    if (!variant || !variant.isActive || variant.product.status !== "ACTIVE") {
        throw new AppError("Variant is not available for purchase", 409);
    }
    if (variant.currency !== "TRY") throw new AppError("Unsupported currency", 409);
    if (!variant.inventory || variant.inventory.quantity < quantity) {
        throw new AppError("Insufficient stock", 409);
    }
    return variant;
}

async function latestCart(tx: Prisma.TransactionClient, cartId: string) {
    return tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
}

export const cartService = {
    get: (identity: CartIdentity) => cartTransaction(async (tx) => {
        const cart = await ensureCart(tx, identity);
        return cartSnapshot(cart);
    }),
    addItem: (identity: CartIdentity, input: CartItemCreateInput) => cartTransaction(async (tx) => {
        const cart = await ensureCart(tx, identity);
        const previous = cart.items.find((item) => item.variantId === input.variantId);
        const quantity = (previous?.quantity ?? 0) + input.quantity;
        if (quantity > 100) throw new AppError("Maximum quantity per item is 100", 400);
        await mustBePurchasable(tx, input.variantId, quantity);
        if (previous) {
            await tx.cartItem.update({ where: { id: previous.id }, data: { quantity } });
        } else {
            await tx.cartItem.create({ data: { cartId: cart.id, variantId: input.variantId, quantity } });
        }
        return cartSnapshot(await latestCart(tx, cart.id));
    }),
    setQuantity: (identity: CartIdentity, itemId: string, quantity: number) => cartTransaction(async (tx) => {
        const cart = await ensureCart(tx, identity);
        const item = cart.items.find((entry) => entry.id === itemId);
        if (!item) throw new AppError("Cart item not found", 404);
        await mustBePurchasable(tx, item.variantId, quantity);
        await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
        return cartSnapshot(await latestCart(tx, cart.id));
    }),
    removeItem: (identity: CartIdentity, itemId: string) => cartTransaction(async (tx) => {
        const cart = await ensureCart(tx, identity);
        const item = cart.items.find((entry) => entry.id === itemId);
        if (!item) throw new AppError("Cart item not found", 404);
        await tx.cartItem.delete({ where: { id: item.id } });
        return cartSnapshot(await latestCart(tx, cart.id));
    }),
    clear: (identity: CartIdentity) => cartTransaction(async (tx) => {
        const cart = await ensureCart(tx, identity);
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return cartSnapshot(await latestCart(tx, cart.id));
    }),
    merge: (userId: string, guestTokenHash: string | undefined) => cartTransaction(async (tx) => {
        const userCart = await ensureCart(tx, { kind: "user", userId });
        if (!guestTokenHash) return cartSnapshot(userCart);
        const guestCart = await findCart(tx, { kind: "guest", tokenHash: guestTokenHash });
        if (!guestCart || guestCart.id === userCart.id) return cartSnapshot(userCart);
        for (const guestItem of guestCart.items) {
            const existing = userCart.items.find((item) => item.variantId === guestItem.variantId);
            const combined = guestItem.quantity + (existing?.quantity ?? 0);
            if (combined > 100) throw new AppError("Merged quantity exceeds item limit", 409);
            await mustBePurchasable(tx, guestItem.variantId, combined);
            if (existing) {
                await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: combined } });
            } else {
                await tx.cartItem.create({ data: { cartId: userCart.id, variantId: guestItem.variantId, quantity: combined } });
            }
        }
        await tx.cart.delete({ where: { id: guestCart.id } });
        return cartSnapshot(await latestCart(tx, userCart.id));
    }),
};
