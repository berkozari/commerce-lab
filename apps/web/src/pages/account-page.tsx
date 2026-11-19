import { useNavigate } from "react-router-dom";
import { useCurrentUser, useLogout, useLogoutAll } from "../features/auth/hooks/use-auth";
import { ApiError } from "../lib/api-client";

export function AccountPage() {
    const { data: user } = useCurrentUser();
    const logout = useLogout();
    const logoutAll = useLogoutAll();
    const navigate = useNavigate();
    const busy = logout.isPending || logoutAll.isPending;
    async function signOut(all: boolean) {
        try {
            if (all) await logoutAll.mutateAsync(); else await logout.mutateAsync();
            void navigate("/", { replace: true });
        } catch { /* Keep session state unchanged and show error. */ }
    }
    return <main className="mx-auto max-w-4xl px-5 py-12 sm:py-20">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Your account</p>
        <h1 className="mt-3 text-4xl font-extrabold">Hello, {user?.name}</h1>
        <p className="mt-2 text-muted">Review your account and manage your demo sessions.</p>
        <div className="mt-9 rounded-2xl border border-[#e1e8e2] bg-white p-6 sm:p-8">
            <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Name</dt><dd className="mt-1 font-semibold">{user?.name}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Email</dt><dd className="mt-1 font-semibold">{user?.email}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Role</dt><dd className="mt-1 font-semibold">{user?.role}</dd></div></dl>
            {(logout.error || logoutAll.error) && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{(logout.error ?? logoutAll.error) instanceof ApiError ? (logout.error ?? logoutAll.error)?.message : "Could not sign out. Please retry."}</p>}
            <div className="mt-8 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void signOut(false)} className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{logout.isPending ? "Signing out…" : "Sign out"}</button><button type="button" disabled={busy} onClick={() => void signOut(true)} className="rounded-xl border border-[#cbd8d3] bg-white px-5 py-3 text-sm font-bold disabled:opacity-60">{logoutAll.isPending ? "Signing out everywhere…" : "Sign out everywhere"}</button></div>
        </div>
    </main>;
}
