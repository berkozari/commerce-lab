import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import {
    listProductsQuerySchema,
    variantCreateSchema,
    variantUpdateSchema,
} from "../../src/schemas/catalog.schema.js";

const db = vi.hoisted(() => ({
    product: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    variant: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    inventory: { upsert: vi.fn() },
    transaction: vi.fn(),
}));

// Isolate the repository boundary. These are unit tests, not PostgreSQL integration tests.
vi.mock("../../src/repositories/catalog.repository.js", () => ({
    catalogRepository: {
        product: () => db.product,
        variant: () => db.variant,
        inventory: () => db.inventory,
        transaction: db.transaction,
    },
    productDetails: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        variants: { include: { inventory: true }, orderBy: { createdAt: "asc" } },
    },
}));

const { catalogService } = await import("../../src/services/catalog.service.js");

const productId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
const otherVariantId = "33333333-3333-4333-8333-333333333333";

const variants = [
    { id: variantId, sku: "P-RED", isActive: true, inventory: { quantity: 7 }, price: "29.90" },
    { id: otherVariantId, sku: "P-OLD", isActive: false, inventory: { quantity: 50 }, price: "19.90" },
];

const product = {
    id: productId,
    slug: "demo-product",
    status: "ACTIVE" as const,
    name: "Demo Product",
    variants,
};

beforeEach(() => {
    vi.resetAllMocks();
    db.transaction.mockImplementation(async (callback: (tx: { product: typeof db.product }) => Promise<unknown>) =>
        callback({ product: db.product }));
});

describe("catalogService variant creation", () => {
    it("does not create a variant under an unknown product", async () => {
        db.product.findUnique.mockResolvedValue(null);
        const input = variantCreateSchema.parse({ sku: "P-RED", name: "Red", price: "29.90", quantity: 4 });

        await expect(catalogService.createVariant(productId, input))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(db.variant.create).not.toHaveBeenCalled();
    });

    it("creates exact decimal pricing with nested inventory and schema defaults", async () => {
        db.product.findUnique.mockResolvedValue({ id: productId });
        db.variant.create.mockResolvedValue({ id: variantId });
        const input = variantCreateSchema.parse({ sku: "P-RED", name: "Red", price: "29.90", quantity: 4 });

        await expect(catalogService.createVariant(productId, input))
            .resolves.toMatchObject({ id: variantId });
        const args = db.variant.create.mock.calls[0]?.[0];
        expect(args).toBeDefined();
        expect(args).toMatchObject({
            data: {
                productId,
                sku: "P-RED",
                name: "Red",
                isActive: true,
                currency: "TRY",
                attributes: {},
                inventory: { create: { quantity: 4 } },
            },
            include: { inventory: true },
        });
        expect(args.data.price).toBeInstanceOf(Prisma.Decimal);
        expect(args.data.price.toString()).toBe("29.9");
    });
});

describe("catalogService variant updates", () => {
    it("rejects a variant belonging to another product", async () => {
        db.variant.findFirst.mockResolvedValue(null);
        const input = variantUpdateSchema.parse({ isActive: false });

        await expect(catalogService.updateVariant(productId, variantId, input))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(db.variant.findFirst).toHaveBeenCalledWith({ where: { id: variantId, productId } });
        expect(db.variant.update).not.toHaveBeenCalled();
    });

    it("blocks disabling the only active variant of a published product", async () => {
        db.variant.findFirst.mockResolvedValue({ id: variantId, isActive: true });
        db.product.findUnique.mockResolvedValue({ status: "ACTIVE" });
        db.variant.count.mockResolvedValue(1);
        const input = variantUpdateSchema.parse({ isActive: false });

        await expect(catalogService.updateVariant(productId, variantId, input))
            .rejects.toMatchObject({ statusCode: 409 });
        expect(db.variant.count).toHaveBeenCalledWith({ where: { productId, isActive: true } });
        expect(db.variant.update).not.toHaveBeenCalled();
    });

    it("allows disabling one variant when another active variant remains", async () => {
        db.variant.findFirst.mockResolvedValue({ id: variantId, isActive: true });
        db.product.findUnique.mockResolvedValue({ status: "ACTIVE" });
        db.variant.count.mockResolvedValue(2);
        db.variant.update.mockResolvedValue({ id: variantId, isActive: false });
        const input = variantUpdateSchema.parse({ isActive: false });

        await expect(catalogService.updateVariant(productId, variantId, input))
            .resolves.toMatchObject({ isActive: false });
        expect(db.variant.update).toHaveBeenCalledWith({
            where: { id: variantId }, data: { isActive: false }, include: { inventory: true },
        });
    });

    it("allows disabling the last active variant of a draft product", async () => {
        db.variant.findFirst.mockResolvedValue({ id: variantId, isActive: true });
        db.product.findUnique.mockResolvedValue({ status: "DRAFT" });
        db.variant.update.mockResolvedValue({ id: variantId, isActive: false });
        const input = variantUpdateSchema.parse({ isActive: false });

        await catalogService.updateVariant(productId, variantId, input);
        expect(db.variant.count).not.toHaveBeenCalled();
        expect(db.variant.update).toHaveBeenCalledOnce();
    });

    it("converts a revised price to Prisma.Decimal without altering stock", async () => {
        db.variant.findFirst.mockResolvedValue({ id: variantId, isActive: true });
        db.variant.update.mockResolvedValue({ id: variantId });
        const input = variantUpdateSchema.parse({ price: "45.90" });

        await catalogService.updateVariant(productId, variantId, input);
        const data = db.variant.update.mock.calls[0]?.[0]?.data;
        expect(data?.price).toBeInstanceOf(Prisma.Decimal);
        expect(data?.price.toString()).toBe("45.9");
        expect(data).not.toHaveProperty("quantity");
        expect(db.inventory.upsert).not.toHaveBeenCalled();
    });
});

describe("catalogService stock updates", () => {
    it("rejects stock updates for a missing variant", async () => {
        db.variant.findUnique.mockResolvedValue(null);

        await expect(catalogService.setStock(variantId, 10))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(db.inventory.upsert).not.toHaveBeenCalled();
    });

    it.each([0, 25])("upserts quantity %i for an existing variant", async (quantity) => {
        db.variant.findUnique.mockResolvedValue({ id: variantId });
        db.inventory.upsert.mockResolvedValue({ variantId, quantity });

        await expect(catalogService.setStock(variantId, quantity))
            .resolves.toMatchObject({ variantId, quantity });
        expect(db.inventory.upsert).toHaveBeenCalledWith({
            where: { variantId }, create: { variantId, quantity }, update: { quantity },
        });
    });
});

describe("catalogService public/admin visibility", () => {
    it("retrieves public products only when their status is ACTIVE", async () => {
        db.product.findFirst.mockResolvedValue(null);

        await expect(catalogService.getPublicProduct("demo-product"))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(db.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { slug: "demo-product", status: "ACTIVE" },
        }));
    });

    it("hides inactive variants and inventory from a public product response", async () => {
        db.product.findFirst.mockResolvedValue(product);

        const result = await catalogService.getPublicProduct("demo-product");
        expect(result.variants).toHaveLength(1);
        expect(result.variants[0]).toMatchObject({ id: variantId, isActive: true });
        expect(result.variants[0]).not.toHaveProperty("inventory");
    });

    it("preserves inactive variants and inventory in the admin product response", async () => {
        db.product.findUnique.mockResolvedValue(product);

        const result = await catalogService.getAdminProduct(productId);
        expect(result.variants).toHaveLength(2);
        expect(result.variants[1]).toHaveProperty("inventory.quantity", 50);
        expect(db.product.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productId } }));
    });

    it("limits the public product list to ACTIVE products and strips private inventory", async () => {
        db.product.count.mockResolvedValue(1);
        db.product.findMany.mockResolvedValue([product]);
        const query = listProductsQuerySchema.parse({ page: 1, limit: 10 });

        const result = await catalogService.listProducts(query);
        expect(db.product.count).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
        expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
        expect(result.items[0]?.variants).toHaveLength(1);
        expect(result.items[0]?.variants[0]).not.toHaveProperty("inventory");
    });

    it("preserves inventory and inactive variants in the admin list with a status filter", async () => {
        db.product.count.mockResolvedValue(1);
        db.product.findMany.mockResolvedValue([product]);
        const query = listProductsQuerySchema.parse({ page: 1, limit: 10 });

        const result = await catalogService.listProducts(query, true, "DRAFT");
        expect(db.product.count).toHaveBeenCalledWith({ where: { status: "DRAFT" } });
        expect(result.items[0]?.variants).toHaveLength(2);
        expect(result.items[0]?.variants[1]).toHaveProperty("inventory.quantity", 50);
    });
});
