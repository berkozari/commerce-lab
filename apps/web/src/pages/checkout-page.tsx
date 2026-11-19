import { useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { formatPrice } from "../features/catalog/api/catalog";
import { useCart } from "../features/cart/hooks/use-cart";
import { useCheckout } from "../features/checkout/hooks/use-orders";
import { shippingSchema, type ShippingForm } from "../features/checkout/schemas/shipping.schema";
import { ApiError } from "../lib/api-client";

const fieldClass = "mt-1 w-full rounded-xl border border-[#ccd9cf] bg-white px-4 py-3";
export function CheckoutPage() {
    const cart = useCart();
    const checkout = useCheckout();
    const navigate = useNavigate();
    const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
    const { register, handleSubmit, formState: { errors } } = useForm<ShippingForm>({
        resolver: zodResolver(shippingSchema),
        defaultValues: { recipientName: "", phone: "", country: "TR", city: "", district: "", addressLine: "", postalCode: "" },
    });
    async function submit(values: ShippingForm) {
        const fingerprint = JSON.stringify(values);
        if (attempt.current?.fingerprint !== fingerprint) {
            attempt.current = { fingerprint, key: crypto.randomUUID() };
        }
        try {
            const result = await checkout.mutateAsync({ shippingAddress: values, key: attempt.current.key });
            navigate(`/orders/${result.order.id}`, { replace: true });
        } catch { /* Keep idempotency key for safe retry of identical request. */ }
    }
    if (cart.isPending) return <main role="status" className="mx-auto max-w-5xl px-5 py-16">Loading checkout…</main>;
    if (cart.isError) return <main role="alert" className="mx-auto max-w-5xl px-5 py-16">Could not load your cart. <Link to="/cart" className="underline">Return to cart</Link></main>;
    if (cart.data.items.length === 0) return <main className="mx-auto max-w-5xl px-5 py-16"><h1 className="text-3xl font-bold">Your cart is empty</h1><Link className="mt-5 inline-block text-brand underline" to="/products">Browse products</Link></main>;
    if (cart.data.items.some(item => !item.available)) return <main className="mx-auto max-w-5xl px-5 py-16"><p role="alert">One or more cart items are no longer available.</p><Link className="mt-5 inline-block text-brand underline" to="/cart">Review your cart</Link></main>;
    return <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8"><h1 className="text-4xl font-extrabold">Checkout</h1><p className="mt-2 text-muted">Demo checkout only — do not enter real personal information.</p><div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={event => void handleSubmit(submit)(event)} noValidate className="space-y-5 rounded-2xl border border-[#dfe7df] bg-white p-6"><h2 className="text-xl font-bold">Demo shipping address</h2>
            {([["recipientName", "Recipient name"], ["phone", "Phone"], ["city", "City"], ["district", "District"], ["addressLine", "Address line"], ["postalCode", "Postal code (optional)"]] as const).map(([name, label]) => <div key={name}><label htmlFor={`ship-${name}`} className="text-sm font-semibold">{label}</label><input id={`ship-${name}`} autoComplete="off" className={fieldClass} aria-invalid={Boolean(errors[name])} {...register(name)} />{errors[name] && <p role="alert" className="mt-1 text-sm text-red-700">{errors[name]?.message}</p>}</div>)}
            {checkout.isError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{checkout.error instanceof ApiError ? checkout.error.message : "Checkout failed. Please retry."}</p>}
            <Button type="submit" disabled={checkout.isPending} className="w-full">{checkout.isPending ? "Creating order…" : "Place demo order"}</Button>
        </form>
        <aside className="h-fit rounded-2xl border border-[#dfe7df] bg-white p-6"><h2 className="text-xl font-bold">Your order</h2>{cart.data.items.map(item => <div key={item.id} className="mt-4 flex justify-between gap-3 text-sm"><span>{item.product.name} × {item.quantity}</span><strong className="whitespace-nowrap">{formatPrice(item.lineTotal, item.currency)}</strong></div>)}<div className="mt-5 flex justify-between border-t pt-5 font-bold"><span>Subtotal</span><span>{formatPrice(cart.data.availableSubtotal, cart.data.currency)}</span></div><p className="mt-3 text-xs text-muted">Final amounts and stock are recalculated by the server.</p></aside>
    </div></main>;
}
