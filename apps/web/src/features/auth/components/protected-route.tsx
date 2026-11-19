import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/use-auth";
import type { AuthUser } from "../api/auth";

export function ProtectedRoute({ role }: { role?: AuthUser["role"] }) {
    const { data: user, isPending, isError, refetch } = useCurrentUser();
    const location = useLocation();
    if (isPending) return <main role="status" className="mx-auto max-w-3xl px-5 py-16 text-muted">Checking your session…</main>;
    if (isError) return <main role="alert" className="mx-auto max-w-3xl px-5 py-16"><p>Could not verify your session.</p><button className="mt-4 font-semibold text-brand underline" onClick={() => void refetch()}>Retry</button></main>;
    if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
    if (role && user.role !== role) return <main role="alert" className="mx-auto max-w-3xl px-5 py-16">You do not have permission to view this page.</main>;
    return <Outlet />;
}
