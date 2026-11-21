import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    categoryCreateSchema,
    categoryUpdateSchema,
    productCreateSchema,
    productUpdateSchema,
} from "../../src/schemas/catalog.schema.js";
import { Prisma } from "../../src/generated/prisma/client.js";

const db = vi.hoisted(() => ({
    category: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    variant: { count: vi.fn() },
}));

// Mock the service's repository boundary, not Prisma's generated client.
// No real database connection or transaction is opened by this suite.
vi.mock("../../src/repositories/catalog.repository.js", () => ({
    catalogRepository: {
        category: () => db.category,
        product: () => db.product,
        variant: () => db.variant,
    },
    productDetails: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        variants: { include: { inventory: true }, orderBy: { createdAt: "asc" } },
    },
}));

const { catalogService } = await import("../../src/services/catalog.service.js");

const categoryId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
    vi.resetAllMocks();
});

describe("catalogService category hierarchy (database-free)", () => {
    it("rejects a category whose parent is missing before attempting an insert", async () => {
        db.category.findUnique.mockResolvedValue(null);
        const input = categoryCreateSchema.parse({ name: "Child", slug: "child", parentId });

        await expect(catalogService.createCategory(input)).rejects.toMatchObject({ statusCode: 404 });
        expect(db.category.create).not.toHaveBeenCalled();
    });

    it("creates a category under an existing parent", async () => {
        db.category.findUnique.mockResolvedValue({ parentId: null });
        db.category.create.mockResolvedValue({ id: categoryId });
        const input = categoryCreateSchema.parse({ name: "Child", slug: "child", parentId });

        await expect(catalogService.createCategory(input)).resolves.toMatchObject({ id: categoryId });
        expect(db.category.create).toHaveBeenCalledWith({ data: input });
    });

    it("blocks direct self-parenting during category update", async () => {
        db.category.findUnique.mockResolvedValue({ id: categoryId });
        const input = categoryUpdateSchema.parse({ parentId: categoryId });

        await expect(catalogService.updateCategory(categoryId, input)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.category.update).not.toHaveBeenCalled();
    });

    it("blocks indirect cycles through a descendant category", async () => {
        db.category.findUnique.mockImplementation((args: { where: { id: string } }) => {
            if (args.where.id === categoryId) return Promise.resolve({ id: categoryId, parentId: null });
            if (args.where.id === parentId) return Promise.resolve({ parentId: categoryId });
            return Promise.resolve(null);
        });
        const input = categoryUpdateSchema.parse({ parentId });

        await expect(catalogService.updateCategory(categoryId, input)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.category.update).not.toHaveBeenCalled();
    });

    it("rejects an update pointing to a nonexistent ancestor", async () => {
        db.category.findUnique.mockResolvedValueOnce({ id: categoryId }).mockResolvedValueOnce(null);
        const input = categoryUpdateSchema.parse({ parentId });

        await expect(catalogService.updateCategory(categoryId, input)).rejects.toMatchObject({ statusCode: 404 });
        expect(db.category.update).not.toHaveBeenCalled();
    });

    it("allows detaching a category from its parent", async () => {
        db.category.findUnique.mockResolvedValue({ id: categoryId });
        db.category.update.mockResolvedValue({ id: categoryId, parentId: null });
        const input = categoryUpdateSchema.parse({ parentId: null });

        await catalogService.updateCategory(categoryId, input);
        expect(db.category.findUnique).toHaveBeenCalledTimes(1);
        expect(db.category.update).toHaveBeenCalledWith({ where: { id: categoryId }, data: input });
    });
});

describe("catalogService product publication rules (database-free)", () => {
    it("does not create a product for a missing category", async () => {
        db.category.findUnique.mockResolvedValue(null);
        const input = productCreateSchema.parse({ categoryId, name: "Demo Product", slug: "demo-product" });

        await expect(catalogService.createProduct(input)).rejects.toMatchObject({ statusCode: 404 });
        expect(db.product.create).not.toHaveBeenCalled();
    });

    it("creates a draft product when its category exists", async () => {
        db.category.findUnique.mockResolvedValue({ id: categoryId });
        db.product.create.mockResolvedValue({ id: productId, status: "DRAFT" });
        const input = productCreateSchema.parse({ categoryId, name: "Demo Product", slug: "demo-product" });

        await expect(catalogService.createProduct(input)).resolves.toMatchObject({ status: "DRAFT" });
        expect(db.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: input }));
    });

    it("rejects publication without at least one active variant", async () => {
        db.variant.count.mockResolvedValue(0);
        const input = productUpdateSchema.parse({ status: "ACTIVE" });

        await expect(catalogService.updateProduct(productId, input)).rejects.toMatchObject({ statusCode: 409 });
        expect(db.variant.count).toHaveBeenCalledWith({ where: { productId, isActive: true } });
        expect(db.product.update).not.toHaveBeenCalled();
    });

    it("allows publication when an active variant is available", async () => {
        db.variant.count.mockResolvedValue(1);
        db.product.update.mockResolvedValue({ id: productId, status: "ACTIVE" });
        const input = productUpdateSchema.parse({ status: "ACTIVE" });

        await expect(catalogService.updateProduct(productId, input)).resolves.toMatchObject({ status: "ACTIVE" });
        expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productId }, data: input }));
    });
});


describe("catalogService Prisma error translation (database-free)", () => {
    it.each([
        ["P2002", 409], // Unique constraint conflict
        ["P2003", 409], // Foreign-key constraint conflict
        ["P2025", 404], // Record not found
    ] as const)("maps Prisma %s into HTTP %i", async (code, statusCode) => {
        db.product.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
            "Catalog database failure", { code, clientVersion: "7.10.0" },
        ));

        await expect(catalogService.archiveProduct(productId))
            .rejects.toMatchObject({ statusCode });
        expect(db.product.update).toHaveBeenCalledWith({
            where: { id: productId }, data: { status: "ARCHIVED" },
        });
    });
});
