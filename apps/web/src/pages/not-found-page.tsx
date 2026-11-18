import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export function NotFoundPage() {
    return <section className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8"><p className="font-semibold text-brand">404</p><h1 className="mt-3 text-4xl font-bold">Page not found</h1><p className="mt-4 text-muted">This page does not exist, or hasn't been built yet.</p><div className="mt-8"><Button asChild><Link to="/">Return home</Link></Button></div></section>;
}
