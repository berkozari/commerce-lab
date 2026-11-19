import type { ProductFilters, ProductSort } from "../api/catalog";

export const PAGE_SIZE = 12;
export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
    { value: "newest", label: "Newest arrivals" },
    { value: "oldest", label: "Oldest first" },
    { value: "name-asc", label: "Name: A to Z" },
    { value: "name-desc", label: "Name: Z to A" },
    { value: "price-asc", label: "Price: low to high" },
    { value: "price-desc", label: "Price: high to low" },
];
const validPrice = (value: string | null) => value && /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value) ? value : undefined;
export function readFilters(params: URLSearchParams, categoryId?: string): ProductFilters {
    const pageParam = Number(params.get("page"));
    const page = Number.isSafeInteger(pageParam) && pageParam >= 1 && pageParam <= 100000 ? pageParam : 1;
    const requestedSort = params.get("sort");
    const sort = SORT_OPTIONS.find((option) => option.value === requestedSort)?.value ?? "newest";
    const query = params.get("q")?.trim().slice(0, 100);
    const minPrice = validPrice(params.get("minPrice"));
    const maxPrice = validPrice(params.get("maxPrice"));
    return {
        page, limit: PAGE_SIZE, sort,
        ...(query ? { q: query } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(minPrice ? { minPrice } : {}),
        ...(maxPrice ? { maxPrice } : {}),
    };
}
export function updateFilterParams(current: URLSearchParams, changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!("page" in changes)) next.delete("page");
    return next;
}
