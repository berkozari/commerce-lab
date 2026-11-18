import { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../config/database.js";
import type { CartIdentity } from "../middlewares/cart-identity.middleware.js";
import { AppError } from "../utils/app-error.js";

export const cartInclude = {
    items: {
        orderBy: { createdAt: "asc" as const },
        include: { variant: { include: { product: true, inventory: true } } },
    },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export function findCart(tx: Prisma.TransactionClient, identity: CartIdentity) {
    return identity.kind === "user"
        ? tx.cart.findFirst({ where: { userId: identity.userId }, include: cartInclude })
        : tx.cart.findUnique({ where: { guestTokenHash: identity.tokenHash }, include: cartInclude });
}

export async function ensureCart(tx: Prisma.TransactionClient, identity: CartIdentity): Promise<CartWithItems> {
    const existing = await findCart(tx, identity);
    if (existing) return existing;
    return tx.cart.create({
        data: identity.kind === "user" ? { userId: identity.userId } : { guestTokenHash: identity.tokenHash },
        include: cartInclude,
    });
}

// Serializable transactions plus bounded retries protect cart-item increments and concurrent first-cart creation.
export async function cartTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await getPrisma().$transaction(fn, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === "P2034" || error.code === "P2002") && attempt < 2) continue;
            if (error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === "P2034" || error.code === "P2002")) {
                throw new AppError("Cart changed concurrently; retry request", 409);
            }
            throw error;
        }
    }
    throw new AppError("Cart operation failed; retry request", 409);
}
