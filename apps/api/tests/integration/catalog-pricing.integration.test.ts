import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in PostgreSQL integration suite. The normal API test command skips it.
const isolatedDatabaseUrl = process.env.EC013_CHECKOUT_TEST_DATABASE_URL;

function assertIsolatedDatabase(raw: string): void {
    const url = new URL(raw);
    const safe = ["postgresql:", "postgres:"].includes(url.protocol)
        && ["localhost", "127.0.0.1"].includes(url.hostname)
        && url.port === "5433"
        && url.username === "commercelab"
        && url.pathname === "/commercelab_checkout_test"
        && url.hash === ""
        && [...url.searchParams.keys()].every((key) => key === "schema")
        && (!url.searchParams.has("schema") || url.searchParams.get("schema") === "public");
    if (!safe) {
        throw new Error("EC-014.3.5 only permits local commercelab_checkout_test (port 5433)");
    }
}

type Database = ReturnType<typeof import("../../src/config/database.js")["getPrisma"]>;
type App = typeof import("../../src/app.js")["app"];
type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
type FixtureKey = "alpha" | "beta" | "gamma" | "delta" | "draft" | "archived" | "emptyDraft" | "outside" | "split";
type VariantFixture = { id: string; isActive: boolean; price: string };
type ProductFixture = { id: string; slug: string; variants: VariantFixture[] };
type VariantSpec = { price: string; isActive?: boolean; stock?: number };

type ProductResponse = {
    id: string;
    status: ProductStatus;
    variants: Array<{ id: string; isActive: boolean; inventory?: { quantity: number } | null }>;
};
type ListResponse = {
    items: ProductResponse[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

// Separate from the regular 154-test API regression; only the guarded DB runner enables it.
describe.skipIf(!isolatedDatabaseUrl)("EC-014.3.5: real PostgreSQL catalog price ordering and visibility", () => {
    let db: Database;
    let app: App;
    let disconnect: () => Promise<void>;
    let primaryCategoryId: string;
    let secondaryCategoryId: string;
    let adminCookie: string;
    const products = {} as Record<FixtureKey, ProductFixture>;
    const created = {
        categories: [] as string[],
        products: [] as string[],
        variants: [] as string[],
        inventories: [] as string[],
        users: [] as string[],
        sessions: [] as string[],
    };

    beforeAll(async () => {
        // Never import the DB/app before validating the destination.
        assertIsolatedDatabase(isolatedDatabaseUrl!);
        process.env.DATABASE_URL = isolatedDatabaseUrl!;
        process.env.NODE_ENV = "test";
        process.env.AUTH_JWT_SECRET = "ec014-catalog-only-jwt-secret-not-for-production";
        process.env.AUTH_CSRF_SECRET = "ec014-catalog-only-csrf-secret-not-for-production";
        process.env.CORS_ORIGIN = "http://127.0.0.1:5173";

        const database = await import("../../src/config/database.js");
        db = database.getPrisma();
        disconnect = database.disconnectDatabase;
        const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
        if (actual[0]?.name !== "commercelab_checkout_test") {
            throw new Error("EC-014.3.5 refuses to write to an unexpected database");
        }
        ({ app } = await import("../../src/app.js"));

        const suffix = randomUUID().replace(/-/g, "").slice(0, 14);
        const first = await db.category.create({
            data: { name: "EC014 Catalog Pricing Primary", slug: `ec014-pricing-primary-${suffix}` },
        });
        created.categories.push(first.id);
        primaryCategoryId = first.id;
        const second = await db.category.create({
            data: { name: "EC014 Catalog Pricing Secondary", slug: `ec014-pricing-secondary-${suffix}` },
        });
        created.categories.push(second.id);
        secondaryCategoryId = second.id;

        async function makeProduct(
            key: FixtureKey, name: string, status: ProductStatus, variants: VariantSpec[],
            categoryId = primaryCategoryId, description?: string,
        ): Promise<void> {
            const slug = `ec014-pricing-${key.toLowerCase()}-${suffix}`;
            const product = await db.product.create({
                data: { categoryId, name, slug, description, status },
            });
            created.products.push(product.id);
            const rows: VariantFixture[] = [];
            for (const [index, spec] of variants.entries()) {
                const isActive = spec.isActive ?? true;
                const variant = await db.productVariant.create({
                    data: {
                        productId: product.id, name: `Size ${index + 1}`,
                        sku: `EC014-PRICE-${key.toUpperCase()}-${index}-${suffix}`,
                        price: spec.price, currency: "TRY", isActive,
                    },
                });
                created.variants.push(variant.id);
                rows.push({ id: variant.id, isActive, price: spec.price });
                if (spec.stock !== undefined) {
                    const inventory = await db.inventory.create({
                        data: { variantId: variant.id, quantity: spec.stock },
                    });
                    created.inventories.push(inventory.id);
                }
            }
            products[key] = { id: product.id, slug, variants: rows };
        }

        // Primary category: 4 published products, 2 drafts and 1 archived.
        // Inactive variants are deliberately cheaper to catch an incorrect price MIN().
        await makeProduct("alpha", "Alpha Wool Jacket", "ACTIVE", [
            { price: "90.00", stock: 3 }, { price: "35.00", stock: 8 },
            { price: "0.50", isActive: false, stock: 0 },
        ], primaryCategoryId, "Warm wool layer for winter");
        await makeProduct("beta", "Beta Hoodie", "ACTIVE", [
            { price: "12.50", stock: 7 }, { price: "1.00", isActive: false, stock: 0 },
        ]);
        await makeProduct("gamma", "Gamma Jacket", "ACTIVE", [{ price: "35.00", stock: 4 }]);
        await makeProduct("delta", "Delta Boots", "ACTIVE", [{ price: "150.00", stock: 5 }]);
        await makeProduct("draft", "Draft Sweater", "DRAFT", [{ price: "4.00", stock: 6 }]);
        await makeProduct("archived", "Archived Sweater", "ARCHIVED", [{ price: "6.00", stock: 1 }]);
        await makeProduct("emptyDraft", "No Variants Yet", "DRAFT", []);
        // Secondary category also checks that the price range is satisfied by ONE active variant.
        await makeProduct("outside", "Outside Product", "ACTIVE", [{ price: "2.00" }], secondaryCategoryId);
        await makeProduct("split", "Split Price Product", "ACTIVE", [
            { price: "10.00" }, { price: "90.00" },
        ], secondaryCategoryId);

        const user = await db.user.create({
            data: {
                email: `ec014-pricing-admin-${suffix}@example.invalid`,
                name: "EC014 Pricing Admin", role: "ADMIN", passwordHash: "fixture-never-used-for-login",
            },
        });
        created.users.push(user.id);
        const sessionId = randomUUID();
        const { hashToken, signAccessToken } = await import("../../src/lib/auth-crypto.js");
        const { ACCESS_COOKIE } = await import("../../src/lib/auth-cookies.js");
        await db.authSession.create({
            data: {
                id: sessionId, userId: user.id,
                refreshTokenHash: hashToken(`ec014-pricing-${randomUUID()}`),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
        });
        created.sessions.push(sessionId);
        adminCookie = `${ACCESS_COOKIE}=${await signAccessToken(user.id, sessionId)}`;
    }, 30_000);

    afterAll(async () => {
        if (!db) return;
        try {
            // Delete only records created by this suite. No TRUNCATE, migrations, or reset.
            await db.inventory.deleteMany({ where: { id: { in: created.inventories } } });
            await db.productVariant.deleteMany({ where: { id: { in: created.variants } } });
            await db.product.deleteMany({ where: { id: { in: created.products } } });
            await db.category.deleteMany({ where: { id: { in: created.categories } } });
            await db.authSession.deleteMany({ where: { id: { in: created.sessions } } });
            await db.user.deleteMany({ where: { id: { in: created.users } } });
        } finally {
            await disconnect();
        }
    }, 30_000);

    const ids = (list: ListResponse) => list.items.map((item) => item.id);
    const tieIds = () => [products.alpha.id, products.gamma.id].sort();

    it("sorts public prices ascending before pagination, with a stable ID tie-breaker", async () => {
        const first = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc", page: 1, limit: 2 });
        const second = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc", page: 2, limit: 2 });
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const expected = [products.beta.id, ...tieIds(), products.delta.id];
        expect([...ids(first.body.data), ...ids(second.body.data)]).toEqual(expected);
        expect(first.body.data.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
        expect(second.body.data.pagination).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    });

    it("sorts descending by the least expensive ACTIVE variant, retaining deterministic ties", async () => {
        const response = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-desc", limit: 10 });
        expect(response.status).toBe(200);
        expect(ids(response.body.data)).toEqual([
            products.delta.id, ...tieIds(), products.beta.id,
        ]);
    });

    it("excludes inactive variants and inventory details from the public product list", async () => {
        const response = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc" });
        expect(response.status).toBe(200);
        const alpha = (response.body.data as ListResponse).items.find((item) => item.id === products.alpha.id);
        expect(alpha).toBeDefined();
        expect(alpha!.variants.map((variant) => variant.id).sort()).toEqual(
            products.alpha.variants.filter((variant) => variant.isActive).map((variant) => variant.id).sort(),
        );
        for (const item of (response.body.data as ListResponse).items) {
            expect(item.status).toBe("ACTIVE");
            for (const variant of item.variants) {
                expect(variant.isActive).toBe(true);
                expect(variant).not.toHaveProperty("inventory");
            }
        }
    });

    it("restricts public product detail to published products and removes private variant data", async () => {
        const visible = await request(app).get(`/api/v1/products/${products.alpha.slug}`);
        const draft = await request(app).get(`/api/v1/products/${products.draft.slug}`);
        const archived = await request(app).get(`/api/v1/products/${products.archived.slug}`);
        expect(visible.status).toBe(200);
        expect(visible.body.data.variants).toHaveLength(2);
        expect(visible.body.data.variants.every((variant: { isActive: boolean }) => variant.isActive)).toBe(true);
        expect(visible.body.data.variants.every((variant: { inventory?: unknown }) => !("inventory" in variant))).toBe(true);
        expect(draft.status).toBe(404);
        expect(archived.status).toBe(404);
    });

    it("applies a numeric range only to ACTIVE variants and keeps matching counts consistent", async () => {
        const matching = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc", minPrice: "30.00", maxPrice: "40.00" });
        const inactiveOnly = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc", minPrice: "0.00", maxPrice: "2.00" });
        expect(matching.status).toBe(200);
        expect(inactiveOnly.status).toBe(200);
        expect(ids(matching.body.data)).toEqual(tieIds());
        expect(matching.body.data.pagination.total).toBe(2);
        expect(ids(inactiveOnly.body.data)).toEqual([]);
        expect(inactiveOnly.body.data.pagination.total).toBe(0);
    });

    it("requires a single active variant to satisfy both price bounds", async () => {
        const noMatch = await request(app).get("/api/v1/products")
            .query({ categoryId: secondaryCategoryId, sort: "price-asc", minPrice: "30", maxPrice: "50" });
        const low = await request(app).get("/api/v1/products")
            .query({ categoryId: secondaryCategoryId, sort: "price-asc", minPrice: "10", maxPrice: "20" });
        const high = await request(app).get("/api/v1/products")
            .query({ categoryId: secondaryCategoryId, sort: "price-asc", minPrice: "80", maxPrice: "100" });
        expect([noMatch.status, low.status, high.status]).toEqual([200, 200, 200]);
        expect(ids(noMatch.body.data)).toEqual([]);
        expect(noMatch.body.data.pagination.total).toBe(0);
        expect(ids(low.body.data)).toEqual([products.split.id]);
        expect(ids(high.body.data)).toEqual([products.split.id]);
    });

    it("applies category and case-insensitive name/description search consistently", async () => {
        const byName = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-asc", q: "aLpHa" });
        const byDescription = await request(app).get("/api/v1/products")
            .query({ categoryId: primaryCategoryId, sort: "price-desc", q: "WoOl" });
        const wrongCategory = await request(app).get("/api/v1/products")
            .query({ categoryId: secondaryCategoryId, sort: "price-asc", q: "alpha" });
        expect([byName.status, byDescription.status, wrongCategory.status]).toEqual([200, 200, 200]);
        expect(ids(byName.body.data)).toEqual([products.alpha.id]);
        expect(ids(byDescription.body.data)).toEqual([products.alpha.id]);
        expect(ids(wrongCategory.body.data)).toEqual([]);
    });

    it("orders DRAFT products for admins with no-price products last", async () => {
        const response = await request(app).get("/api/v1/admin/products")
            .set("Cookie", adminCookie)
            .query({ categoryId: primaryCategoryId, status: "DRAFT", sort: "price-asc" });
        expect(response.status).toBe(200);
        expect(ids(response.body.data)).toEqual([products.draft.id, products.emptyDraft.id]);
        expect(response.body.data.pagination.total).toBe(2);
    });

    it("allows admins to see every status and full variant/inventory details", async () => {
        const response = await request(app).get("/api/v1/admin/products")
            .set("Cookie", adminCookie)
            .query({ categoryId: primaryCategoryId, sort: "price-asc" });
        const detail = await request(app).get(`/api/v1/admin/products/${products.alpha.id}`)
            .set("Cookie", adminCookie);
        expect(response.status).toBe(200);
        expect(detail.status).toBe(200);
        expect(response.body.data.pagination.total).toBe(7);
        expect(ids(response.body.data)).toContain(products.archived.id);
        expect(ids(response.body.data)).toContain(products.draft.id);
        expect(ids(response.body.data).at(-1)).toBe(products.emptyDraft.id);
        expect(detail.body.data.variants).toHaveLength(3);
        expect(detail.body.data.variants.some((variant: { isActive: boolean }) => !variant.isActive)).toBe(true);
        expect(detail.body.data.variants.some((variant: { inventory: { quantity: number } | null }) => variant.inventory?.quantity === 8)).toBe(true);
    });
});
