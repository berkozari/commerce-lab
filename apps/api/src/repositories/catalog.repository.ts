import { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../config/database.js";

export const catalogRepository = {
    category: () => getPrisma().category,
    product: () => getPrisma().product,
    variant: () => getPrisma().productVariant,
    image: () => getPrisma().productImage,
    inventory: () => getPrisma().inventory,
    transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => getPrisma().$transaction(fn),
};

export const productDetails = {
    category: { select: { id: true, name: true, slug: true } },
    images: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] },
    variants: { include: { inventory: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProductInclude;
