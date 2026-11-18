import { ArrowRight, Layers3, ShieldCheck, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

const steps = [
    { icon: Layers3, name: "Foundation", description: "Routing, typed API access, TanStack Query and a reusable UI layer." },
    { icon: ShoppingBag, name: "Storefront", description: "Homepage, categories, product details, search and filters arrive in EC-009." },
    { icon: ShieldCheck, name: "Customer experience", description: "Authentication and checkout interfaces follow after the storefront." },
];

export function HomePage() {
    return (
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="max-w-3xl">
                <p className="mb-5 inline-flex rounded-full bg-[#e1f1e8] px-3 py-1 text-xs font-bold uppercase tracking-[0.13em] text-brand">EC-008 · Frontend foundation</p>
                <h1 className="text-4xl font-bold leading-[1.09] tracking-[-0.045em] sm:text-6xl">Everything in place for a better <span className="text-brand">shopping experience.</span></h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-muted">The CommerceLab frontend is connected to the API and ready for real product discovery. The storefront pages will be built next.</p>
                <div className="mt-8"><Button asChild><Link to="/system">Check API connection <ArrowRight size={17} aria-hidden="true" /></Link></Button></div>
            </div>
            <section aria-labelledby="roadmap" className="mt-20">
                <h2 id="roadmap" className="mb-6 text-xl font-bold tracking-tight">What this foundation enables</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    {steps.map(({ icon: Icon, name, description }) => (
                        <article key={name} className="rounded-2xl border border-[#e1e8e2] bg-white p-7 shadow-sm">
                            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf3ed] text-brand"><Icon aria-hidden="true" size={21} /></div>
                            <h3 className="text-lg font-semibold">{name}</h3>
                            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
