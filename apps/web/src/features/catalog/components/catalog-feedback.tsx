import { AlertCircle, PackageSearch, RefreshCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";

export function CatalogLoading({ label = "Loading products" }: { label?: string }) {
    return <div role="status" aria-live="polite" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><span className="sr-only">{label}</span>{Array.from({ length: 6 }, (_, i) => <div key={i} className="animate-pulse overflow-hidden rounded-3xl border border-[#e1e8e2] bg-white"><div className="aspect-[4/3] bg-[#e7ece6]" /><div className="space-y-3 p-5"><div className="h-3 w-20 rounded bg-[#e7ece6]" /><div className="h-5 w-4/5 rounded bg-[#e7ece6]" /><div className="h-5 w-1/3 rounded bg-[#e7ece6]" /></div></div>)}</div>;
}
export function CatalogError({ message, retry }: { message?: string; retry: () => void }) {
    return <div role="alert" className="rounded-3xl border border-red-200 bg-white p-10 text-center"><AlertCircle size={30} className="mx-auto text-red-600" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold">Couldn't load the catalog</h2><p className="mt-2 text-sm text-muted">{message ?? "Please try again in a moment."}</p><Button className="mt-6" onClick={retry}><RefreshCcw size={17} /> Retry</Button></div>;
}
export function CatalogEmpty({ reset }: { reset?: () => void }) {
    return <div className="rounded-3xl border border-dashed border-[#d5ded6] bg-white p-12 text-center"><PackageSearch size={34} className="mx-auto text-brand" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold">No products found</h2><p className="mt-2 text-sm text-muted">Try a different search or adjust your filters.</p>{reset && <Button variant="outline" onClick={reset} className="mt-6">Clear filters</Button>}</div>;
}
