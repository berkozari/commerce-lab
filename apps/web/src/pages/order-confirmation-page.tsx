import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { formatPrice } from "../features/catalog/api/catalog";
import { useDemoPayment, useOrder } from "../features/checkout/hooks/use-orders";
import { ApiError } from "../lib/api-client";

export function OrderConfirmationPage() {
    const { id = "" } = useParams();
    const query = useOrder(id);
    const payment = useDemoPayment(id);
    if (query.isPending) return <main className="mx-auto max-w-4xl px-5 py-16" role="status">Loading order…</main>;
    if (query.isError) return <main className="mx-auto max-w-4xl px-5 py-16" role="alert">{query.error instanceof ApiError && query.error.status === 404 ? "Order not found." : "Could not load order."} <Button onClick={() => void query.refetch()}>Retry</Button></main>;
    const order = query.data;
    const pending = order.status === "PENDING" && order.paymentStatus === "UNPAID";
    return <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8"><p className="text-sm font-bold uppercase tracking-widest text-brand">Demo order</p><h1 className="mt-3 text-3xl font-extrabold">Order {order.orderNumber}</h1>
        <div className="mt-6 rounded-2xl border border-[#dfe7df] bg-white p-6"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted">Order status</dt><dd className="font-bold">{order.status}</dd></div><div><dt className="text-sm text-muted">Payment</dt><dd className="font-bold">{order.paymentStatus}</dd></div></dl>
            <h2 className="mt-7 text-xl font-bold">Items</h2>{order.items.map(item => <div key={item.id} className="mt-4 flex justify-between gap-3 text-sm"><span>{item.productName} ({item.sku}) × {item.quantity}</span><span>{formatPrice(item.totalPrice, order.currency)}</span></div>)}
            <div className="mt-6 flex justify-between border-t pt-5 text-lg font-bold"><span>Total</span><span>{formatPrice(order.total, order.currency)}</span></div>
            {pending && <div className="mt-8 rounded-xl bg-[#eff5ef] p-5"><h3 className="font-bold">Simulate payment</h3><p className="mt-2 text-sm text-muted">No payment method or card details are collected. Failure cancels the order and returns stock.</p><div className="mt-4 flex flex-wrap gap-3"><Button disabled={payment.isPending} onClick={() => void payment.mutateAsync("success").catch(() => { })}>Demo payment success</Button><Button variant="outline" disabled={payment.isPending} onClick={() => void payment.mutateAsync("failure").catch(() => { })}>Demo payment failure</Button></div></div>}
            {payment.isError && <p className="mt-4 text-sm text-red-700" role="alert">{payment.error instanceof ApiError ? payment.error.message : "Demo payment failed. Please retry."}</p>}
            {order.paymentStatus === "PAID_DEMO" && <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800" role="status">Demo payment confirmed. Thank you!</p>}
            {order.status === "CANCELLED" && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800" role="status">Order cancelled. No payment was charged.</p>}
        </div><div className="mt-7 flex flex-wrap gap-6"><Link to="/orders" className="font-semibold text-brand underline">All my orders</Link><Link to="/products" className="font-semibold text-brand underline">Continue shopping</Link></div>
    </main>;
}
