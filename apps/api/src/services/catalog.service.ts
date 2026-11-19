import { Prisma } from "../generated/prisma/client.js";
import { catalogRepository as repo, productDetails } from "../repositories/catalog.repository.js";
import { AppError } from "../utils/app-error.js";
import type {
    AdminProductListQuery, CategoryCreateInput, CategoryUpdateInput, ImageCreateInput, ImageUpdateInput,
    ProductCreateInput, ProductListQuery, ProductUpdateInput, VariantCreateInput, VariantUpdateInput,
} from "../schemas/catalog.schema.js";

function handleDbError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new AppError("A unique value is already in use", 409);
        if (error.code === "P2003") throw new AppError("Referenced resource does not exist or is in use", 409);
        if (error.code === "P2025") throw new AppError("Resource not found", 404);
    }
    throw error;
}
async function change<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) { return handleDbError(error); }
}
async function categoryExists(categoryId: string): Promise<void> {
    if (!await repo.category().findUnique({ where: { id: categoryId }, select: { id: true } })) {
        throw new AppError("Category not found", 404);
    }
}
async function productExists(productId: string): Promise<void> {
    if (!await repo.product().findUnique({ where: { id: productId }, select: { id: true } })) {
        throw new AppError("Product not found", 404);
    }
}
async function ensureAcyclic(categoryId: string, parentId: string | null | undefined): Promise<void> {
    if (!parentId) return;
    const visited = new Set([categoryId]);
    let current: string | null = parentId;
    while (current) {
        if (visited.has(current)) throw new AppError("Category hierarchy cannot contain cycles", 400);
        visited.add(current);
        const parent: { parentId: string | null } | null = await repo.category().findUnique({
            where: { id: current }, select: { parentId: true },
        });
        if (!parent) throw new AppError("Parent category not found", 404);
        current = parent.parentId;
    }
}

function listWhere(query: ProductListQuery, status?: "DRAFT" | "ACTIVE" | "ARCHIVED"): Prisma.ProductWhereInput {
    return {
        ...(status ? { status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.minPrice !== undefined || query.maxPrice !== undefined ? {
            variants: {
                some: {
                    isActive: true, price: {
                        ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
                        ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
                    }
                }
            },
        } : {}),
        ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
}
function ordering(sort: ProductListQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
        case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
        case "name-asc": return [{ name: "asc" }, { id: "asc" }];
        case "name-desc": return [{ name: "desc" }, { id: "asc" }];
        default: return [{ createdAt: "desc" }, { id: "asc" }];
    }
}
function pagination(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export const catalogService = {
    listCategories: (parentId?: string) => repo.category().findMany({
        where: parentId ? { parentId } : undefined,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, slug: true, parentId: true, children: { select: { id: true, name: true, slug: true } } },
    }),
    createCategory: (input: CategoryCreateInput) => change(async () => {
        await ensureAcyclic("", input.parentId);
        return repo.category().create({ data: input });
    }),
    updateCategory: (id: string, input: CategoryUpdateInput) => change(async () => {
        await categoryExists(id);
        if (input.parentId !== undefined) await ensureAcyclic(id, input.parentId);
        return repo.category().update({ where: { id }, data: input });
    }),
    async listProducts(query: ProductListQuery, admin = false, adminStatus?: AdminProductListQuery["status"]) {
        const where = listWhere(query, admin ? adminStatus : "ACTIVE");
        const [total, items] = await repo.transaction(async (tx) => {
            const total = await tx.product.count({ where });
            if (query.sort === "price-asc" || query.sort === "price-desc") {
                // Sort by lowest ACTIVE variant price. Database pagination keeps pages globally ordered.
                // Parameterized SQL avoids loading and sorting the complete catalog in application memory.
                const filters: Prisma.Sql[] = [];
                if (!admin || adminStatus) filters.push(Prisma.sql`p."status"::text = ${admin ? adminStatus! : "ACTIVE"}`);
                if (query.categoryId) filters.push(Prisma.sql`p."categoryId" = ${query.categoryId}::uuid`);
                if (query.q) {
                    const term = `%${query.q}%`;
                    filters.push(Prisma.sql`(p."name" ILIKE ${term} OR p."description" ILIKE ${term})`);
                }
                if (query.minPrice !== undefined || query.maxPrice !== undefined) {
                    const range: Prisma.Sql[] = [Prisma.sql`pv2."productId" = p.id`, Prisma.sql`pv2."isActive" = true`];
                    if (query.minPrice !== undefined) range.push(Prisma.sql`pv2."price" >= ${query.minPrice}::numeric`);
                    if (query.maxPrice !== undefined) range.push(Prisma.sql`pv2."price" <= ${query.maxPrice}::numeric`);
                    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" pv2 WHERE ${Prisma.join(range, " AND ")})`);
                }
                const condition = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty;
                const direction = query.sort === "price-asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
                const offset = (query.page - 1) * query.limit;
                const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                    SELECT p.id FROM "Product" p
                    LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id AND pv."isActive" = true
                    ${condition}
                    GROUP BY p.id
                    ORDER BY MIN(pv."price") ${direction} NULLS LAST, p.id ASC
                    LIMIT ${query.limit} OFFSET ${offset}
                `);
                if (!ids.length) return [total, []] as const;
                const products = await tx.product.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: productDetails });
                const positions = new Map(ids.map((row, index) => [row.id, index]));
                products.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
                return [total, products] as const;
            }
            const products = await tx.product.findMany({
                where, orderBy: ordering(query.sort), skip: (query.page - 1) * query.limit,
                take: query.limit, include: productDetails,
            });
            return [total, products] as const;
        });
        // Unauthenticated clients must not see inactive variants or their inventory quantities.
        const data = admin ? items : items.map(({ variants, ...product }) => ({
            ...product, variants: variants.filter((variant) => variant.isActive).map(({ inventory, ...variant }) => { void inventory; return variant; }),
        }));
        return { items: data, pagination: pagination(query.page, query.limit, total) };
    },
    async getPublicProduct(slug: string) {
        const product = await repo.product().findFirst({ where: { slug, status: "ACTIVE" }, include: productDetails });
        if (!product) throw new AppError("Product not found", 404);
        return { ...product, variants: product.variants.filter((variant) => variant.isActive).map(({ inventory, ...variant }) => { void inventory; return variant; }) };
    },
    getAdminProduct: async (id: string) => {
        const item = await repo.product().findUnique({ where: { id }, include: productDetails });
        if (!item) throw new AppError("Product not found", 404);
        return item;
    },
    createProduct: (input: ProductCreateInput) => change(async () => {
        await categoryExists(input.categoryId);
        return repo.product().create({ data: input, include: productDetails });
    }),
    updateProduct: (id: string, input: ProductUpdateInput) => change(async () => {
        if (input.categoryId) await categoryExists(input.categoryId);
        // An ACTIVE product must have at least one active variant before publication.
        if (input.status === "ACTIVE") {
            const count = await repo.variant().count({ where: { productId: id, isActive: true } });
            if (count === 0) throw new AppError("An active variant is required before publication", 409);
        }
        return repo.product().update({ where: { id }, data: input, include: productDetails });
    }),
    archiveProduct: (id: string) => change(() => repo.product().update({ where: { id }, data: { status: "ARCHIVED" } })),
    createVariant: (productId: string, input: VariantCreateInput) => change(async () => {
        await productExists(productId);
        const { quantity, price, ...rest } = input;
        return repo.variant().create({
            data: {
                ...rest, productId, price: new Prisma.Decimal(price),
                inventory: { create: { quantity } }
            }, include: { inventory: true }
        });
    }),
    updateVariant: (productId: string, variantId: string, input: VariantUpdateInput) => change(async () => {
        const found = await repo.variant().findFirst({ where: { id: variantId, productId } });
        if (!found) throw new AppError("Variant not found", 404);
        if (input.isActive === false && found.isActive) {
            const product = await repo.product().findUnique({ where: { id: productId }, select: { status: true } });
            if (product?.status === "ACTIVE") {
                const activeCount = await repo.variant().count({ where: { productId, isActive: true } });
                if (activeCount <= 1) throw new AppError("Cannot disable the last active variant of a published product", 409);
            }
        }
        const { price, ...rest } = input;
        return repo.variant().update({
            where: { id: variantId }, data: {
                ...rest,
                ...(price === undefined ? {} : { price: new Prisma.Decimal(price) })
            }, include: { inventory: true }
        });
    }),
    addImage: (productId: string, input: ImageCreateInput) => change(async () => {
        await productExists(productId);
        return repo.image().create({ data: { ...input, productId } });
    }),
    updateImage: (productId: string, imageId: string, input: ImageUpdateInput) => change(async () => {
        const image = await repo.image().findFirst({ where: { id: imageId, productId } });
        if (!image) throw new AppError("Image not found", 404);
        return repo.image().update({ where: { id: imageId }, data: input });
    }),
    deleteImage: (productId: string, imageId: string) => change(async () => {
        const image = await repo.image().findFirst({ where: { id: imageId, productId } });
        if (!image) throw new AppError("Image not found", 404);
        await repo.image().delete({ where: { id: imageId } });
        return { deleted: true };
    }),
    setStock: (variantId: string, quantity: number) => change(async () => {
        const variant = await repo.variant().findUnique({ where: { id: variantId }, select: { id: true } });
        if (!variant) throw new AppError("Variant not found", 404);
        return repo.inventory().upsert({ where: { variantId }, create: { variantId, quantity }, update: { quantity } });
    }),
};
