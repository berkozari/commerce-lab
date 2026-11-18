import { Link, NavLink, Outlet } from "react-router-dom";
import { ShoppingBag, ArrowUpRight } from "lucide-react";

export function SiteLayout() {
    return (
        <div className="min-h-dvh flex flex-col">
            <header className="border-b border-[#e1e8e2] bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
                    <Link className="flex items-center gap-2 text-xl font-extrabold tracking-tight" to="/" aria-label="CommerceLab home">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><ShoppingBag size={19} aria-hidden="true" /></span>
                        CommerceLab<span className="text-brand">.</span>
                    </Link>
                    <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm font-semibold text-muted">
                        <NavLink to="/" end className={({ isActive }) => isActive ? "text-brand" : "hover:text-ink"}>Home</NavLink>
                        <NavLink to="/system" className={({ isActive }) => isActive ? "text-brand" : "hover:text-ink"}>System status</NavLink>
                    </nav>
                </div>
            </header>
            <main className="flex-1"><Outlet /></main>
            <footer className="border-t border-[#e1e8e2] bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 text-xs text-muted sm:px-8">
                    <span>© {new Date().getFullYear()} CommerceLab · Portfolio project</span>
                    <span className="inline-flex items-center gap-1">Storefront in EC-009 <ArrowUpRight size={13} aria-hidden="true" /></span>
                </div>
            </footer>
        </div>
    );
}
