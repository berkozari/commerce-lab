import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { CatalogEmpty, CatalogError, CatalogLoading } from "../features/catalog/components/catalog-feedback";
import { ProductCard } from "../features/catalog/components/product-card";
import { useCategories, useProducts } from "../features/catalog/hooks/use-catalog";
import { readFilters, SORT_OPTIONS, updateFilterParams } from "../features/catalog/lib/search-params";

export function ProductListPage({ categoryPage = false }: { categoryPage?: boolean }) {
    const { slug } = useParams();
    const [params, setParams] = useSearchParams();
    const categoryQuery = useCategories();
    const category = categoryPage ? categoryQuery.data?.find((item) => item.slug === slug) : undefined;
    const filters = readFilters(params, categoryPage ? category?.id : params.get("category") || undefined);
    const [search, setSearch] = useState(filters.q ?? "");
    const [minPrice, setMinPrice] = useState(filters.minPrice ?? "");
    const [maxPrice, setMaxPrice] = useState(filters.maxPrice ?? "");
    useEffect(() => setSearch(filters.q ?? ""), [filters.q]);
    useEffect(() => setMinPrice(filters.minPrice ?? ""), [filters.minPrice]);
    useEffect(() => setMaxPrice(filters.maxPrice ?? ""), [filters.maxPrice]);
    // A category permalink must not accidentally show all products while the category is unresolved.
    const products = useProducts(filters, !categoryPage || Boolean(category));
    const change = (values: Record<string, string | undefined>) => setParams(updateFilterParams(params, values));
    const reset = () => setParams(new URLSearchParams());
    const invalidRange = Boolean(minPrice && maxPrice && Number(minPrice) > Number(maxPrice));
    const pricePattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
    const invalidPrice = Boolean((minPrice && !pricePattern.test(minPrice)) || (maxPrice && !pricePattern.test(maxPrice)) || invalidRange);
    if (categoryPage && categoryQuery.isPending) return <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8"><p role="status">Loading category…</p></main>;
    if (categoryPage && categoryQuery.isError) return <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8"><CatalogError retry={() => void categoryQuery.refetch()} /></main>;
    if (categoryPage && !category) return <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8"><h1 className="text-3xl font-bold">Category not found</h1><Link className="mt-4 inline-block text-brand underline" to="/products">Browse all products</Link></main>;
    return <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-brand">CommerceLab / Shop</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{category?.name ?? "Explore the collection"}</h1><p className="mt-3 max-w-xl text-muted">Find thoughtfully selected products for your everyday life.</p></div>
        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside aria-label="Product filters" className="h-fit rounded-3xl border border-[#e3e7e2] bg-white p-5 lg:sticky lg:top-6">
                <h2 className="mb-5 flex items-center gap-2 font-bold"><SlidersHorizontal size={18} /> Filters</h2>
                {!categoryPage && <div className="mb-5"><label htmlFor="category" className="mb-2 block text-sm font-semibold">Category</label><select id="category" value={params.get("category") ?? ""} onChange={(e) => change({ category: e.target.value })} className="w-full rounded-xl border border-[#d7e0d9] bg-white p-3 text-sm"><option value="">All categories</option>{categoryQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
                <form onSubmit={(e) => { e.preventDefault(); if (!invalidPrice) change({ minPrice: minPrice || undefined, maxPrice: maxPrice || undefined }); }}>
                    <p className="mb-2 text-sm font-semibold">Price range (TRY)</p><div className="grid grid-cols-2 gap-2"><div className="min-w-0"><label className="mb-1 block text-xs text-muted" htmlFor="minPrice">Min</label><input id="minPrice" inputMode="decimal" placeholder="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="min-w-0 w-full rounded-xl border border-[#d7e0d9] px-3 py-2 text-sm" /></div><div className="min-w-0"><label className="mb-1 block text-xs text-muted" htmlFor="maxPrice">Max</label><input id="maxPrice" inputMode="decimal" placeholder="Any" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="min-w-0 w-full rounded-xl border border-[#d7e0d9] px-3 py-2 text-sm" /></div></div>
                    {invalidPrice && <p role="alert" className="mt-2 text-xs text-red-700">Enter valid prices; minimum cannot exceed maximum.</p>}
                    <Button className="mt-4 w-full" size="sm" disabled={invalidPrice}>Apply price</Button>
                </form>
                <button type="button" onClick={reset} className="mt-5 text-sm font-semibold text-brand underline underline-offset-4">Clear all filters</button>
                {categoryPage && <Link to="/products" className="mt-5 block text-sm text-muted underline">All products</Link>}
            </aside>
            <section aria-label="Product results" className="min-w-0">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <form onSubmit={e => { e.preventDefault(); change({ q: search.trim() || undefined }); }} className="flex w-full max-w-md gap-2"><label htmlFor="catalog-search" className="sr-only">Search products</label><input id="catalog-search" placeholder="Search products…" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#d7e0d9] bg-white px-4 py-3 text-sm" /><Button aria-label="Search" type="submit" size="sm"><Search size={18} /></Button></form>
                    <div className="flex items-center gap-3"><label htmlFor="catalog-sort" className="shrink-0 text-sm text-muted">Sort by</label><select id="catalog-sort" className="min-w-0 rounded-xl border border-[#d7e0d9] bg-white px-3 py-3 text-sm" value={filters.sort} onChange={e => change({ sort: e.target.value })}>{SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                </div>
                {products.isPending ? <CatalogLoading /> : products.isError ? <CatalogError message={products.error instanceof Error ? products.error.message : undefined} retry={() => void products.refetch()} /> : products.data.items.length === 0 ? <CatalogEmpty reset={reset} /> : <><p className="mb-4 text-sm text-muted">{products.data.pagination.total} products found</p><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{products.data.items.map(product => <ProductCard key={product.id} product={product} />)}</div>
                    <nav aria-label="Product pages" className="mt-9 flex items-center justify-center gap-4"><Button variant="outline" disabled={filters.page <= 1} onClick={() => setParams(updateFilterParams(params, { page: String(filters.page - 1) }))}><ChevronLeft size={16} /> Previous</Button><span className="text-sm text-muted">Page {products.data.pagination.page} of {Math.max(1, products.data.pagination.totalPages)}</span><Button variant="outline" disabled={filters.page >= products.data.pagination.totalPages} onClick={() => setParams(updateFilterParams(params, { page: String(filters.page + 1) }))}>Next <ChevronRight size={16} /></Button></nav>
                </>}
            </section>
        </div>
    </div>;
}
