import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ImageOff, Package, ShieldCheck, Truck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { CatalogError } from "../features/catalog/components/catalog-feedback";
import { formatPrice } from "../features/catalog/api/catalog";
import { useProduct } from "../features/catalog/hooks/use-catalog";
import { ApiError } from "../lib/api-client";
import { useAddCartItem } from "../features/cart/hooks/use-cart";

export function ProductDetailPage() {
    const { slug = "" } = useParams();
    const productQuery = useProduct(slug);
    const [imageIndex, setImageIndex] = useState(0);
    const [variantId, setVariantId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [added, setAdded] = useState(false);
    const addCart = useAddCartItem();
    useEffect(() => { setImageIndex(0); setVariantId(""); setQuantity(1); setAdded(false); }, [slug]);
    if (productQuery.isPending) return <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8" role="status">Loading product…</div>;
    if (productQuery.isError) return <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">{productQuery.error instanceof ApiError && productQuery.error.status === 404 ? <div><h1 className="text-3xl font-bold">Product not found</h1><Link className="mt-5 inline-block text-brand underline" to="/products">Browse products</Link></div> : <CatalogError message={productQuery.error instanceof Error ? productQuery.error.message : undefined} retry={() => void productQuery.refetch()} />}</div>;
    const product = productQuery.data;
    const selectedVariant = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
    const picture = product.images[imageIndex] ?? product.images[0];
    return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted"><Link to="/products" className="hover:text-brand">Shop</Link><span aria-hidden="true">/</span><Link to={`/categories/${product.category.slug}`} className="hover:text-brand">{product.category.name}</Link><span aria-hidden="true">/</span><span className="text-ink">{product.name}</span></nav>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <section aria-label="Product images"><div className="flex aspect-square items-center justify-center overflow-hidden rounded-[2rem] bg-[#eef1eb]">{picture ? <img src={picture.url} alt={picture.altText ?? product.name} className="h-full w-full object-cover" /> : <div className="flex flex-col items-center gap-3 text-muted"><ImageOff size={42} aria-hidden="true" />Image coming soon</div>}</div>
                {product.images.length > 1 && <div className="mt-4 flex flex-wrap gap-3">{product.images.map((image, index) => <button key={image.id} type="button" onClick={() => setImageIndex(index)} aria-label={`View image ${index + 1}`} aria-pressed={index === imageIndex} className={`h-20 w-20 overflow-hidden rounded-xl border-2 ${index === imageIndex ? "border-brand" : "border-transparent"}`}><img src={image.url} alt={image.altText ?? `${product.name} view ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}
            </section>
            <section><p className="text-xs font-bold uppercase tracking-[.17em] text-brand">{product.category.name}</p><h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{product.name}</h1>
                <p className="mt-6 text-3xl font-bold">{selectedVariant ? formatPrice(selectedVariant.price, selectedVariant.currency) : "Price unavailable"}</p>
                <div className="mt-6 border-t border-[#dfe7df] pt-6"><p className="leading-7 text-muted whitespace-pre-line">{product.description || "A carefully selected addition to your everyday essentials."}</p></div>
                {product.variants.length > 0 && <div className="mt-9"><label htmlFor="product-variant" className="mb-3 block text-sm font-bold">Choose an option</label><select id="product-variant" value={selectedVariant?.id ?? ""} onChange={e => { setVariantId(e.target.value); setAdded(false); }} className="w-full rounded-xl border border-[#ccd9cf] bg-white px-4 py-3.5">{product.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name} · {formatPrice(variant.price, variant.currency)}</option>)}</select>{selectedVariant && <p className="mt-3 flex items-center gap-2 text-sm text-brand"><CheckCircle2 size={17} aria-hidden="true" /> Available option · SKU {selectedVariant.sku}</p>}</div>}
                <div className="mt-8 rounded-2xl border border-[#dce6de] bg-[#eff5ef] p-5"><p className="font-semibold">Ready to add to cart?</p><div className="mt-4 flex items-center gap-4"><label htmlFor="product-quantity" className="text-sm font-semibold">Quantity</label><select id="product-quantity" value={quantity} onChange={e => { setQuantity(Number(e.target.value)); setAdded(false); }} className="rounded-xl border bg-white px-4 py-2">{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></div><Button className="mt-5 w-full" disabled={!selectedVariant?.isActive || addCart.isPending} onClick={() => { if (!selectedVariant) return; setAdded(false); void addCart.mutateAsync({ variantId: selectedVariant.id, quantity }).then(() => setAdded(true)).catch(() => { }); }}>{addCart.isPending ? "Adding…" : "Add to cart"}</Button>{added && <p role="status" className="mt-3 text-sm font-semibold text-brand">Added to cart. <Link to="/cart" className="underline">View cart</Link></p>}{addCart.isError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{addCart.error instanceof ApiError ? addCart.error.message : "Could not add this item."}</p>}</div>
                <div className="mt-8 grid gap-4 text-sm text-muted sm:grid-cols-3"><span className="flex items-center gap-2"><Truck size={19} className="text-brand" /> Demo delivery</span><span className="flex items-center gap-2"><ShieldCheck size={19} className="text-brand" /> Local test store</span><span className="flex items-center gap-2"><Package size={19} className="text-brand" /> Product options</span></div>
                <Link className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline" to="/products"><ArrowLeft size={16} /> Back to the shop</Link>
            </section>
        </div>
    </div>;
}
