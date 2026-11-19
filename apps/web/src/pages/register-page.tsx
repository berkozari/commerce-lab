import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api-client";
import { AuthFormShell, authInputClass } from "../features/auth/components/auth-form-shell";
import { useRegister } from "../features/auth/hooks/use-auth";
import { registerFormSchema } from "../features/auth/schemas/auth-form.schema";
import { safeReturnPath } from "../features/auth/lib/redirect";
import type { RegisterInput } from "../features/auth/api/auth";

export function RegisterPage() {
    const registerUser = useRegister();
    const navigate = useNavigate();
    const location = useLocation();
    const destination = safeReturnPath((location.state as { from?: unknown } | null)?.from);
    const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
        resolver: zodResolver(registerFormSchema), defaultValues: { name: "", email: "", password: "" },
    });
    async function submit(values: RegisterInput) {
        try { await registerUser.mutateAsync(values); void navigate(destination, { replace: true }); } catch { /* Render mutation error below. */ }
    }
    return <AuthFormShell title="Create your account" description="Shop the collection with a free CommerceLab demo account." footer={<>Already have an account? <Link className="font-semibold text-brand underline" to="/login" state={{ from: destination }}>Sign in</Link></>}>
        <form className="space-y-5" onSubmit={event => void handleSubmit(submit)(event)} noValidate>
            <div><label className="text-sm font-semibold" htmlFor="register-name">Full name</label><input id="register-name" type="text" autoComplete="name" className={authInputClass} aria-invalid={Boolean(errors.name)} {...register("name")} />{errors.name && <p className="mt-1 text-sm text-red-700">{errors.name.message}</p>}</div>
            <div><label className="text-sm font-semibold" htmlFor="register-email">Email</label><input id="register-email" type="email" autoComplete="email" className={authInputClass} aria-invalid={Boolean(errors.email)} {...register("email")} />{errors.email && <p className="mt-1 text-sm text-red-700">{errors.email.message}</p>}</div>
            <div><label className="text-sm font-semibold" htmlFor="register-password">Password</label><input id="register-password" type="password" autoComplete="new-password" className={authInputClass} aria-invalid={Boolean(errors.password)} {...register("password")} />{errors.password && <p className="mt-1 text-sm text-red-700">{errors.password.message}</p>}<p className="mt-1 text-xs text-muted">Use at least 10 characters.</p></div>
            {registerUser.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{registerUser.error instanceof ApiError ? registerUser.error.message : "Could not register. Please try again."}</p>}
            <button className="w-full rounded-xl bg-brand px-5 py-3 font-bold text-white hover:opacity-90 disabled:opacity-60" type="submit" disabled={registerUser.isPending}>{registerUser.isPending ? "Creating account…" : "Create account"}</button>
        </form>
    </AuthFormShell>;
}
