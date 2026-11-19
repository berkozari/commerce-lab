import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { formatPrice } from "../features/catalog/api/catalog";
import { useOrdersList } from "../features/checkout/hooks/use-orders";
import { readOrderPage, totalOrderPages } from "../features/checkout/lib/order-pagination";
import { ApiError } from "../lib/api-client";

const PAGE_SIZE = 10;

function showDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function OrdersPage() {
    const [params, setParams] = useSearchParams();
    const page = readOrderPage(params.get("page"));
    const query = useOrdersList(page);

    function changePage(next: number) {
        const updated = new URLSearchParams(params);
        if (next <= 1) updated.delete("page"); else updated.set("page", String(next));
        setParams(updated);
    }

    return <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Your account</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-3xl font-extrabold sm:text-4xl">My orders</h1><p className="mt-2 text-muted">Your past purchases and demo payment status.</p></div>
            <Link to="/account" className="text-sm font-semibold text-brand underline">Back to account</Link>
        </div>

        {query.isPending && <div role="status" className="mt-8 space-y-4" aria-label="Loading orders">
            {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-[#e8eee8]" />)}
        </div>}
        {query.isError && <div role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-800">Could not load your orders.</p>
            <p className="mt-2 text-sm text-red-700">{query.error instanceof ApiError ? query.error.message : "Please try again."}</p>
            <Button className="mt-4" onClick={() => void query.refetch()}>Retry</Button>
        </div>}
        {query.isSuccess && query.data.items.length === 0 && query.data.total === 0 && <div className="mt-10 rounded-2xl border border-[#dfe7df] bg-white p-10 text-center">
            <h2 className="text-xl font-bold">No orders yet</h2>
            <p className="mt-2 text-sm text-muted">Explore the collection and place your first demo order.</p>
            <Link to="/products" className="mt-5 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white">Browse products</Link>
        </div>}
        {query.isSuccess && query.data.items.length === 0 && query.data.total > 0 && <div className="mt-10 rounded-2xl border border-[#dfe7df] bg-white p-8 text-center">
            <p className="font-semibold">There are no orders on this page.</p>
            <Button className="mt-4" onClick={() => changePage(1)}>Go to first page</Button>
        </div>}
        {query.isSuccess && query.data.items.length > 0 && <>
            <div className="mt-8 space-y-4">{query.data.items.map(order => <article key={order.id} className="rounded-2xl border border-[#dfe7df] bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Order placed {showDate(order.createdAt)}</p><h2 className="mt-1 text-lg font-bold">{order.orderNumber}</h2></div>
                    <span className="rounded-full bg-[#edf4ed] px-3 py-1 text-xs font-bold text-[#204d39]">{order.status.replaceAll("_", " ")}</span>
                </div>
                <div className="mt-4 grid gap-3 border-t border-[#e6ebe6] pt-4 text-sm sm:grid-cols-3">
                    <div><p className="text-muted">Payment</p><p className="mt-1 font-semibold">{order.paymentStatus.replaceAll("_", " ")}</p></div>
                    <div><p className="text-muted">Items</p><p className="mt-1 font-semibold">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</p></div>
                    <div><p className="text-muted">Total</p><p className="mt-1 font-semibold">{formatPrice(order.total, order.currency)}</p></div>
                </div>
                <div className="mt-5 flex justify-end"><Link to={`/orders/${encodeURIComponent(order.id)}`} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">View order</Link></div>
            </article>)}</div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#dfe7df] pt-5">
                <p className="text-sm text-muted">{query.data.total} orders · Page {query.data.page} of {totalOrderPages(query.data.total, query.data.limit || PAGE_SIZE)}</p>
                <div className="flex gap-3"><Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="outline" disabled={page >= totalOrderPages(query.data.total, query.data.limit || PAGE_SIZE) || query.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div>
            </div>
        </>}
    </main>;
}
