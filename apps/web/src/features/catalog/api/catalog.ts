import { apiRequest } from "../../../lib/api-client";

export type Category = { id: string; name: string; slug: string; parentId: string | null; children: Pick<Category, "id" | "name" | "slug">[] };
export type ProductImage = { id: string; url: string; altText: string | null; position: number };
export type ProductVariant = { id: string; sku: string; name: string; price: string; currency: string; attributes: Record<string, unknown>; isActive: boolean };
export type Product = {
    id: string; slug: string; name: string; description: string | null;
    categoryId: string; category: Pick<Category, "id" | "name" | "slug">;
    images: ProductImage[]; variants: ProductVariant[]; createdAt: string;
};
export type ProductSort = "newest" | "oldest" | "name-asc" | "name-desc" | "price-asc" | "price-desc";
export type ProductFilters = { q?: string; categoryId?: string; minPrice?: string; maxPrice?: string; sort: ProductSort; page: number; limit: number };
export type ProductList = { items: Product[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

export const catalogApi = {
    categories: () => apiRequest<Category[]>("/api/v1/categories"),
    products: (filters: ProductFilters) => {
        const query = new URLSearchParams();
        query.set("page", String(filters.page)); query.set("limit", String(filters.limit)); query.set("sort", filters.sort);
        if (filters.q) query.set("q", filters.q);
        if (filters.categoryId) query.set("categoryId", filters.categoryId);
        if (filters.minPrice) query.set("minPrice", filters.minPrice);
        if (filters.maxPrice) query.set("maxPrice", filters.maxPrice);
        return apiRequest<ProductList>(`/api/v1/products?${query}`);
    },
    product: (slug: string) => apiRequest<Product>(`/api/v1/products/${encodeURIComponent(slug)}`),
};

export function formatPrice(price: string | number, currency = "TRY"): string {
    const amount = Number(price);
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
}

export function startingPrice(product: Product): ProductVariant | undefined {
    return product.variants.reduce<ProductVariant | undefined>((current, variant) =>
        !current || Number(variant.price) < Number(current.price) ? variant : current, undefined);
}
