import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
    productCreateSchema, variantCreateSchema, stockUpdateSchema, categoryCreateSchema,
    productUpdateSchema, listProductsQuerySchema,
} from "../../src/schemas/catalog.schema.js";

let app: typeof import("../../src/app.js")["app"];
beforeAll(async () => {
    process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
    process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";
    ({ app } = await import("../../src/app.js"));
});

describe("Catalog validation (database-free)", () => {
    it("rejects invalid price and quantity", () => {
        expect(variantCreateSchema.safeParse({ sku: "SKU-1", name: "Standard", price: "-5", quantity: -1 }).success).toBe(false);
        expect(variantCreateSchema.safeParse({ sku: "SKU-1", name: "Standard", price: "15.999", quantity: 1 }).success).toBe(false);
    });
    it("accepts nonnegative decimal strings without floating point rounding", () => {
        expect(variantCreateSchema.safeParse({ sku: "SKU-1", name: "Standard", price: "1499.90" }).success).toBe(true);
    });
    it("rejects invalid slug and unknown fields", () => {
        expect(categoryCreateSchema.safeParse({ name: "Electronics", slug: "Bad Slug" }).success).toBe(false);
        expect(productCreateSchema.safeParse({ categoryId: "not-uuid", name: "Laptop", slug: "laptop" }).success).toBe(false);
    });
    it("rejects empty updates and negative stock", () => {
        expect(productUpdateSchema.safeParse({}).success).toBe(false);
        expect(stockUpdateSchema.safeParse({ quantity: -1 }).success).toBe(false);
    });
    it("limits pagination and validates supported sorting", () => {
        expect(
            listProductsQuerySchema.safeParse({
                page: "1",
                limit: "1000",
            }).success,
        ).toBe(false);

        expect(
            listProductsQuerySchema.safeParse({
                sort: "price-asc",
            }).success,
        ).toBe(true);

        expect(
            listProductsQuerySchema.safeParse({
                sort: "price-desc",
            }).success,
        ).toBe(true);

        expect(
            listProductsQuerySchema.safeParse({
                sort: "invalid-sort",
            }).success,
        ).toBe(false);
    });

    it("validates product price filters", () => {
        expect(
            listProductsQuerySchema.safeParse({
                minPrice: "100",
                maxPrice: "1500",
            }).success,
        ).toBe(true);

        expect(
            listProductsQuerySchema.safeParse({
                minPrice: "-10",
            }).success,
        ).toBe(false);

        expect(
            listProductsQuerySchema.safeParse({
                minPrice: "1500",
                maxPrice: "100",
            }).success,
        ).toBe(false);
    });
});

describe("Catalog API boundaries (database-free)", () => {
    it("requires authentication for admin products", async () => {
        const res = await request(app).get("/api/v1/admin/products");
        expect(res.status).toBe(401);
    });
    it("rejects admin mutation without authentication", async () => {
        const res = await request(app).post("/api/v1/admin/products").send({});
        expect(res.status).toBe(401);
    });
    it("rejects malformed public query before database access", async () => {
        const res = await request(app).get("/api/v1/products?limit=999");
        expect(res.status).toBe(400);
    });
    it("rejects invalid public product slug before database access", async () => {
        const res = await request(app).get("/api/v1/products/x");
        expect(res.status).toBe(400);
    });
});
