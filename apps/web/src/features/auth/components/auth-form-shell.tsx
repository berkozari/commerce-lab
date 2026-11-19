import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthFormShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
    return <main className="mx-auto w-full max-w-lg px-5 py-14 sm:py-20">
        <div className="rounded-3xl border border-[#e1e8e2] bg-white p-7 shadow-sm sm:p-10">
            <Link className="text-sm font-bold text-brand" to="/">CommerceLab / Account</Link>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-7 border-t border-[#e1e8e2] pt-6 text-sm text-muted">{footer}</div>
        </div>
    </main>;
}

export const authInputClass = "mt-1.5 block w-full rounded-xl border border-[#cad8d0] bg-white px-4 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[#add8c5]";
