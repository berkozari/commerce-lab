import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../config/database.js";
import { cartInclude } from "../repositories/cart.repository.js";
import { findOwnedOrder, orderInclude, orderTransaction } from "../repositories/order.repository.js";
import { AppError } from "../utils/app-error.js";
import type { CheckoutInput, DemoPaymentInput, AdminOrderStatusInput, OrderListQuery } from "../schemas/checkout.schema.js";
import type { OrderWithItems } from "../repositories/order.repository.js";

const zero = new Prisma.Decimal(0);

export function checkoutFingerprint(input: CheckoutInput): string {
    // Zod object parser fixes field order for deterministic identical requests.
    return createHash("sha256").update(JSON.stringify(input.shippingAddress)).digest("hex");
}

export function presentOrder(order: OrderWithItems) {
    return {
        id: order.id, orderNumber: order.orderNumber, status: order.status,
        paymentStatus: order.paymentStatus, currency: order.currency,
        subtotal: order.subtotal.toFixed(2), shippingAmount: order.shippingAmount.toFixed(2), total: order.total.toFixed(2),
        shippingAddress: order.shippingAddressSnapshot,
        items: order.items.map((item) => ({
            id: item.id, variantId: item.variantId, productName: item.productName, sku: item.sku,
            quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2), totalPrice: item.totalPrice.toFixed(2),
        })),
        createdAt: order.createdAt, updatedAt: order.updatedAt,
    };
}

function ensureMatchingFingerprint(order: { checkoutFingerprint: string | null }, fingerprint: string): void {
    if (order.checkoutFingerprint !== fingerprint) throw new AppError("Idempotency key used for a different request", 409);
}

async function restockItems(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
        if (!item.variantId) throw new AppError("Order item variant no longer exists; manual review required", 409);
        const changed = await tx.inventory.updateMany({
            where: { variantId: item.variantId }, data: { quantity: { increment: item.quantity } },
        });
        if (changed.count !== 1) throw new AppError("Inventory missing; manual review required", 409);
    }
}

export const orderService = {
    async checkout(userId: string, input: CheckoutInput, key: string) {
        const fingerprint = checkoutFingerprint(input);
        const db = getPrisma();
        const existing = await db.order.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: orderInclude,
        });
        if (existing) { ensureMatchingFingerprint(existing, fingerprint); return { order: presentOrder(existing), replayed: true }; }
        try {
            return await orderTransaction(async (tx) => {
                const replay = await tx.order.findUnique({
                    where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: orderInclude,
                });
                if (replay) { ensureMatchingFingerprint(replay, fingerprint); return { order: presentOrder(replay), replayed: true }; }
                const cart = await tx.cart.findFirst({ where: { userId }, include: cartInclude });
                if (!cart || cart.items.length === 0) throw new AppError("Cart is empty", 409);
                let subtotal = new Prisma.Decimal(0);
                const orderItems: Array<{ variantId: string; productName: string; sku: string; quantity: number; unitPrice: Prisma.Decimal; totalPrice: Prisma.Decimal }> = [];
                for (const item of cart.items) {
                    const variant = item.variant;
                    if (variant.product.status !== "ACTIVE" || !variant.isActive || variant.currency !== "TRY") {
                        throw new AppError("Cart contains an unavailable item", 409);
                    }
                    if (!variant.inventory || variant.inventory.quantity < item.quantity) {
                        throw new AppError("Insufficient stock", 409);
                    }
                    const changed = await tx.inventory.updateMany({
                        where: { variantId: item.variantId, quantity: { gte: item.quantity } },
                        data: { quantity: { decrement: item.quantity } },
                    });
                    if (changed.count !== 1) throw new AppError("Insufficient stock", 409);
                    const totalPrice = variant.price.mul(item.quantity);
                    subtotal = subtotal.plus(totalPrice);
                    orderItems.push({
                        variantId: item.variantId, productName: variant.product.name, sku: variant.sku,
                        quantity: item.quantity, unitPrice: variant.price, totalPrice
                    });
                }
                const order = await tx.order.create({
                    data: {
                        userId, idempotencyKey: key, checkoutFingerprint: fingerprint,
                        orderNumber: `CL-${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`,
                        status: "PENDING", paymentStatus: "UNPAID", currency: "TRY",
                        subtotal, shippingAmount: zero, total: subtotal,
                        shippingAddressSnapshot: input.shippingAddress,
                        items: { create: orderItems },
                    }, include: orderInclude,
                });
                await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
                return { order: presentOrder(order), replayed: false };
            });
        } catch (error) {
            // Unique constraint may win a concurrent checkout with the same key; return its saved result.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const replay = await db.order.findUnique({
                    where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: orderInclude,
                });
                if (replay) { ensureMatchingFingerprint(replay, fingerprint); return { order: presentOrder(replay), replayed: true }; }
            }
            throw error;
        }
    },
    async listMine(userId: string, query: OrderListQuery) {
        const where = { userId };
        const [total, records] = await Promise.all([
            getPrisma().order.count({ where }),
            getPrisma().order.findMany({
                where, include: orderInclude, orderBy: { createdAt: "desc" },
                skip: (query.page - 1) * query.limit, take: query.limit
            }),
        ]);
        return { items: records.map(presentOrder), total, page: query.page, limit: query.limit };
    },
    async getMine(userId: string, orderId: string) { return presentOrder(await findOwnedOrder(userId, orderId)); },
    async demoPayment(userId: string, orderId: string, input: DemoPaymentInput) {
        return orderTransaction(async (tx) => {
            const current = await tx.order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
            if (!current) throw new AppError("Order not found", 404);
            if (current.paymentStatus === "PAID_DEMO") {
                if (input.outcome === "success") return presentOrder(current);
                throw new AppError("Order is already paid", 409);
            }
            if (current.status === "CANCELLED") {
                if (input.outcome === "failure") return presentOrder(current);
                throw new AppError("Cancelled order cannot be paid", 409);
            }
            if (current.status !== "PENDING" || current.paymentStatus !== "UNPAID") {
                throw new AppError("Payment is not available for this order", 409);
            }
            const status = input.outcome === "success" ? "CONFIRMED" : "CANCELLED";
            const paymentStatus = input.outcome === "success" ? "PAID_DEMO" : "UNPAID";
            const updated = await tx.order.updateMany({
                where: { id: current.id, status: "PENDING", paymentStatus: "UNPAID" },
                data: { status, paymentStatus },
            });
            if (updated.count !== 1) throw new AppError("Order state changed; retry request", 409);
            if (input.outcome === "failure") await restockItems(tx, current.id);
            return presentOrder(await tx.order.findUniqueOrThrow({ where: { id: current.id }, include: orderInclude }));
        });
    },
    async listAdmin(query: OrderListQuery) {
        const [total, records] = await Promise.all([
            getPrisma().order.count(),
            getPrisma().order.findMany({
                include: orderInclude, orderBy: { createdAt: "desc" },
                skip: (query.page - 1) * query.limit, take: query.limit
            }),
        ]);
        return { items: records.map(presentOrder), total, page: query.page, limit: query.limit };
    },
    async adminUpdateStatus(orderId: string, input: AdminOrderStatusInput) {
        return orderTransaction(async (tx) => {
            const current = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
            if (!current) throw new AppError("Order not found", 404);
            if (current.status === input.status) return presentOrder(current);
            const transitions: Record<string, string[]> = {
                PENDING: ["CANCELLED"],
                CONFIRMED: ["PROCESSING", "CANCELLED"],
                PROCESSING: ["SHIPPED"],
                SHIPPED: ["DELIVERED"],
            };
            if (!transitions[current.status]?.includes(input.status)) {
                throw new AppError("Invalid order status transition", 409);
            }
            if (input.status !== "CANCELLED" && current.paymentStatus !== "PAID_DEMO") {
                throw new AppError("Only paid orders can be fulfilled", 409);
            }
            const changed = await tx.order.updateMany({
                where: { id: orderId, status: current.status, paymentStatus: current.paymentStatus },
                data: {
                    status: input.status,
                    paymentStatus: input.status === "CANCELLED" && current.paymentStatus === "PAID_DEMO"
                        ? "REFUNDED_DEMO" : current.paymentStatus,
                },
            });
            if (changed.count !== 1) throw new AppError("Order state changed; retry request", 409);
            if (input.status === "CANCELLED") await restockItems(tx, orderId);
            return presentOrder(await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }));
        });
    },
};
