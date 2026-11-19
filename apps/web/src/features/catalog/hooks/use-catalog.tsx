import { useQuery } from "@tanstack/react-query";
import { catalogApi, type ProductFilters } from "../api/catalog";

export function useCategories() {
    return useQuery({ queryKey: ["catalog", "categories"], queryFn: catalogApi.categories, staleTime: 5 * 60_000 });
}
export function useProducts(filters: ProductFilters, enabled = true) {
    return useQuery({ queryKey: ["catalog", "products", filters], queryFn: () => catalogApi.products(filters), enabled });
}
export function useProduct(slug: string) {
    return useQuery({ queryKey: ["catalog", "product", slug], queryFn: () => catalogApi.product(slug), enabled: Boolean(slug) });
}
