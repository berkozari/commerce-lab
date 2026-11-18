import { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";

export const orderInclude = { items: { orderBy: { id: "asc" as const } } } satisfies Prisma.OrderInclude;
export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function orderTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await getPrisma().$transaction(work, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
                if (attempt < 2) continue;
                throw new AppError("Concurrent order operation; retry request", 409);
            }
            throw error;
        }
    }
    throw new AppError("Concurrent order operation; retry request", 409);
}

export async function findOwnedOrder(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await getPrisma().order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
    if (!order) throw new AppError("Order not found", 404);
    return order;
}
