import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { formatPrice } from "../features/catalog/api/catalog";
import { cartMergeWarningKey, useCart, useClearCart, useMergeCart, useRemoveCartItem, useSetCartQuantity } from "../features/cart/hooks/use-cart";
import { useCurrentUser } from "../features/auth/hooks/use-auth";
import { ApiError } from "../lib/api-client";

function message(error: unknown): string { return error instanceof ApiError ? error.message : "Please try again."; }

export function CartPage() {
    const navigate = useNavigate();
    const cart = useCart();
    const { data: user } = useCurrentUser();
    const update = useSetCartQuantity();
    const remove = useRemoveCartItem();
    const clear = useClearCart();
    const merge = useMergeCart();
    const client = useQueryClient();
    const { data: mergeWarning } = useQuery({ queryKey: cartMergeWarningKey, queryFn: async () => false, initialData: false, staleTime: Infinity });
    const busy = update.isPending || remove.isPending || clear.isPending || merge.isPending;
    const mutationError = update.error ?? remove.error ?? clear.error ?? merge.error;
    if (cart.isPending) return <main role="status" className="mx-auto max-w-6xl px-5 py-16">Loading your cart…</main>;
    if (cart.isError) return <main className="mx-auto max-w-6xl px-5 py-16"><p role="alert">Could not load your cart: {message(cart.error)}</p><Button className="mt-5" onClick={() => void cart.refetch()}>Retry</Button></main>;
    const value = cart.data;
    const canCheckout = value.items.length > 0 && value.items.every(item => item.available);
    return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-4xl font-extrabold">Your shopping cart</h1>
        <p className="mt-2 text-muted">Prices and availability are verified again at checkout.</p>
        {mergeWarning && user && <div role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>We couldn't merge your guest cart. Your items are still saved in the guest cart.</p><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void merge.mutateAsync().then(() => client.setQueryData(cartMergeWarningKey, false)).catch(() => { })}>Retry merge</Button></div>}
        {mutationError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{message(mutationError)}</p>}
        {value.items.length === 0 ? <div className="mt-10 rounded-2xl border bg-white p-12 text-center"><ShoppingBag className="mx-auto text-brand" size={36} /><p className="mt-4 text-xl font-semibold">Your cart is empty</p><Link className="mt-5 inline-flex font-semibold text-brand underline" to="/products">Explore products</Link></div> : <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section aria-label="Cart items" className="space-y-4">{value.items.map(item => <article key={item.id} className="rounded-2xl border border-[#dfe7df] bg-white p-5">
                <div className="flex flex-wrap justify-between gap-3"><div><Link to={`/products/${item.product.slug}`} className="text-lg font-bold hover:text-brand">{item.product.name}</Link><p className="text-sm text-muted">{item.variantName} · {item.sku}</p><p className="mt-2 font-semibold">{formatPrice(item.unitPrice, item.currency)} each</p></div><p className="text-xl font-bold">{formatPrice(item.lineTotal, item.currency)}</p></div>
                {!item.available && <p className="mt-3 text-sm font-semibold text-red-700" role="status">{item.unavailableReason ?? "Item unavailable"}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3"><label className="text-sm font-semibold" htmlFor={`quantity-${item.id}`}>Quantity</label><select id={`quantity-${item.id}`} value={item.quantity} disabled={busy} onChange={e => void update.mutateAsync({ itemId: item.id, quantity: Number(e.target.value) }).catch(() => { })} className="rounded-lg border p-2">{Array.from({ length: 100 }, (_, i) => i + 1).map(n => <option value={n} key={n}>{n}</option>)}</select><button className="inline-flex items-center gap-1 text-sm font-semibold text-red-700" type="button" disabled={busy} onClick={() => void remove.mutateAsync(item.id).catch(() => { })}><Trash2 size={16} /> Remove</button></div>
            </article>)}</section>
            <aside className="h-fit rounded-2xl border border-[#dfe7df] bg-white p-6"><h2 className="text-xl font-bold">Order summary</h2><div className="mt-5 flex justify-between"><span>Items ({value.itemCount})</span><strong>{formatPrice(value.availableSubtotal, value.currency)}</strong></div><p className="mt-2 text-xs text-muted">Unavailable lines are excluded from the displayed subtotal; checkout requires all items to be available.</p><Button className="mt-6 w-full" disabled={busy || !canCheckout} onClick={() => navigate(user ? "/checkout" : "/login", user ? undefined : { state: { from: "/checkout" } })}>{user ? "Proceed to checkout" : "Sign in to checkout"}</Button><button type="button" disabled={busy} onClick={() => void clear.mutateAsync().catch(() => { })} className="mt-4 w-full text-sm font-semibold text-muted underline">Clear cart</button></aside>
        </div>}
    </main>;
}
