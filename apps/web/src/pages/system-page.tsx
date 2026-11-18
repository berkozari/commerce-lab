import { Link } from "react-router-dom";
import { RefreshCw, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "../components/ui/button";
import { useHealth } from "../features/system/hooks/use-health";

export function SystemPage() {
    const health = useHealth();
    return (
        <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
            <Link to="/" className="text-sm font-semibold text-brand hover:underline">← Back to home</Link>
            <h1 className="mt-6 text-3xl font-bold tracking-tight">API connection</h1>
            <p className="mt-3 text-muted">This page verifies the existing Express health endpoint using TanStack Query.</p>
            <div role="status" className="mt-8 rounded-2xl border border-[#e1e8e2] bg-white p-6 shadow-sm">
                {health.isPending ? <p>Checking API connection…</p> : health.isError ? (
                    <div className="flex items-start gap-3 text-red-700"><CircleAlert className="mt-0.5" size={22} aria-hidden="true" /><div><h2 className="font-semibold">API unavailable</h2><p className="mt-1 text-sm">Confirm the API is running on port 3000.</p><p className="mt-2 text-xs">{health.error instanceof Error ? health.error.message : "Unknown error"}</p></div></div>
                ) : <div className="flex items-center gap-3 text-brand"><CircleCheck size={24} aria-hidden="true" /><div><h2 className="font-semibold">API connected</h2><p className="mt-1 text-sm">Status: {health.data.status}</p></div></div>}
                <div className="mt-6"><Button variant="outline" onClick={() => void health.refetch()} disabled={health.isFetching}><RefreshCw size={15} aria-hidden="true" /> Retry</Button></div>
            </div>
        </section>
    );
}
