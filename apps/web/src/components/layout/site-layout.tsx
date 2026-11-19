import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ArrowRight, Menu, Search, ShoppingBag, X } from "lucide-react";
import { useCurrentUser, useLogout } from "../../features/auth/hooks/use-auth";

export function SiteLayout() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const navigate = useNavigate();
    const { data: user, isPending } = useCurrentUser();
    const logout = useLogout();

    async function handleSignOut() {
        try {
            await logout.mutateAsync();

            setMobileOpen(false);
            navigate("/", { replace: true });
        } catch {
            // Logout başarısızsa yönlendirme yapma.
            // Hata kullanıcıya ayrıca gösterilmeli.
        }
    }

    const nav = [{ to: "/", label: "Home", end: true }, { to: "/products", label: "Shop", end: false }, { to: "/system", label: "API Status", end: false }];
    return <div className="flex min-h-dvh flex-col">
        <div className="bg-[#183c32] px-5 py-2 text-center text-xs font-medium tracking-wide text-white">A portfolio storefront · Demo orders only, no real payments</div>
        <header className="sticky top-0 z-30 border-b border-[#e1e8e2] bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link className="flex items-center gap-2 text-xl font-extrabold tracking-tight" to="/" aria-label="CommerceLab home" onClick={() => setMobileOpen(false)}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><ShoppingBag size={19} aria-hidden="true" /></span>CommerceLab<span className="text-brand">.</span></Link>
            <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm font-semibold text-muted md:flex">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? "text-brand" : "hover:text-ink"}>{item.label}</NavLink>)}</nav>
            <div className="flex items-center gap-3"><Link to="/products" aria-label="Browse products" className="rounded-full p-2 hover:bg-[#ecf2ec]"><Search size={20} /></Link><span className="hidden rounded-xl border border-[#e1e8e2] px-4 py-2 text-xs font-semibold text-muted lg:inline-flex">Cart UI coming soon</span>{user ? <><Link to="/account" className="text-sm font-semibold text-brand">Account</Link><button type="button" className="hidden text-sm font-semibold text-muted hover:text-ink sm:inline" disabled={logout.isPending} onClick={() => void handleSignOut()}>{logout.isPending ? "Signing out…" : "Sign out"}</button></> : isPending ? <span className="text-xs text-muted" role="status">Session…</span> : <><Link to="/login" className="text-sm font-semibold text-brand">Sign in</Link><Link to="/register" className="hidden rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white sm:inline-flex">Join</Link></>}<button type="button" className="rounded-lg p-2 md:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>{mobileOpen ? <X size={23} /> : <Menu size={23} />}</button></div>
        </div>{mobileOpen && <nav aria-label="Mobile navigation" className="flex flex-col gap-1 border-t border-[#e1e8e2] px-5 py-4 text-sm font-semibold md:hidden">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `rounded-xl px-4 py-3 ${isActive ? "bg-[#e7f1e9] text-brand" : "hover:bg-[#f2f5f1]"}`}>{item.label}</NavLink>)}{user && <Link to="/account" onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3">Account</Link>}{!user && !isPending && <Link to="/register" onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3">Create account</Link>}</nav>}</header>
        <main className="flex-1"><Outlet /></main>
        <footer className="border-t border-[#e1e8e2] bg-white"><div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-3 sm:px-8"><div><Link to="/" className="text-xl font-extrabold">CommerceLab<span className="text-brand">.</span></Link><p className="mt-3 max-w-xs text-sm leading-6 text-muted">A thoughtfully crafted portfolio e-commerce experience, built with modern web technologies.</p></div><div><h2 className="font-bold">Explore</h2><div className="mt-4 flex flex-col gap-3 text-sm text-muted"><Link to="/products" className="hover:text-brand">All products</Link><Link to="/system" className="hover:text-brand">System status</Link></div></div><div><h2 className="font-bold">CommerceLab</h2><p className="mt-4 text-sm leading-6 text-muted">A local demo project. No live orders, real payment processing, or shipping.</p><Link to="/products" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand">Browse collection <ArrowRight size={15} /></Link></div></div><div className="border-t border-[#e1e8e2] px-5 py-5 text-center text-xs text-muted">© {new Date().getFullYear()} CommerceLab · Portfolio project</div></footer>
    </div>;
}
