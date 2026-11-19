import { ArrowUpRight, ImageOff } from "lucide-react";
import { Link } from "react-router-dom";
import { formatPrice, startingPrice, type Product } from "../api/catalog";

export function ProductCard({ product }: { product: Product }) {
    const price = startingPrice(product);
    const image = product.images[0];
    return <article className="group overflow-hidden rounded-[1.4rem] border border-[#e3e7e2] bg-white transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-[#182e2612]">
        <Link to={`/products/${product.slug}`} className="block" aria-label={`View ${product.name}`}>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#eef1eb]">
                {image ? <img loading="lazy" src={image.url} alt={image.altText ?? product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex flex-col items-center gap-2 text-muted"><ImageOff size={30} aria-hidden="true" /><span className="text-xs">Image coming soon</span></div>}
                <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm"><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
            <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-brand">{product.category.name}</p>
                <h3 className="mt-2 line-clamp-2 min-h-[3rem] text-lg font-semibold leading-6">{product.name}</h3>
                <p className="mt-4 text-lg font-bold">{price ? formatPrice(price.price, price.currency) : "Price unavailable"}</p>
                {product.variants.length > 1 && <p className="mt-1 text-xs text-muted">{product.variants.length} options available</p>}
            </div>
        </Link>
    </article>;
}
