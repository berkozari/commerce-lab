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
        const [total, items] = await repo.transaction(async (tx) => Promise.all([
            tx.product.count({ where }),
            tx.product.findMany({
                where, orderBy: ordering(query.sort), skip: (query.page - 1) * query.limit,
                take: query.limit, include: productDetails
            }),
        ]));
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
