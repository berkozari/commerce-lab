import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api-client";
import { AuthFormShell, authInputClass } from "../features/auth/components/auth-form-shell";
import { useCurrentUser, useLogin } from "../features/auth/hooks/use-auth";
import { loginFormSchema } from "../features/auth/schemas/auth-form.schema";
import { safeReturnPath } from "../features/auth/lib/redirect";
import type { LoginInput } from "../features/auth/api/auth";

export function LoginPage() {
    const login = useLogin();
    const { data: user } = useCurrentUser();
    const navigate = useNavigate();
    const location = useLocation();
    const destination = safeReturnPath((location.state as { from?: unknown } | null)?.from);
    const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
        resolver: zodResolver(loginFormSchema), defaultValues: { email: "", password: "" },
    });
    async function submit(values: LoginInput) {
        try { await login.mutateAsync(values); void navigate(destination, { replace: true }); } catch { /* Render mutation error below. */ }
    }
    return <AuthFormShell title="Welcome back" description="Sign in to manage your CommerceLab account." footer={<>New here? <Link className="font-semibold text-brand underline" to="/register" state={{ from: destination }}>Create an account</Link></>}>
        {user && <p className="mb-5 rounded-xl bg-[#eef6f0] p-3 text-sm">You are signed in as {user.email}. <Link className="font-semibold underline" to="/account">Go to account</Link></p>}
        <form className="space-y-5" onSubmit={event => void handleSubmit(submit)(event)} noValidate>
            <div><label className="text-sm font-semibold" htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="email" className={authInputClass} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined} {...register("email")} />{errors.email && <p id="login-email-error" className="mt-1 text-sm text-red-700">{errors.email.message}</p>}</div>
            <div><label className="text-sm font-semibold" htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" className={authInputClass} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined} {...register("password")} />{errors.password && <p id="login-password-error" className="mt-1 text-sm text-red-700">{errors.password.message}</p>}</div>
            {login.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{login.error instanceof ApiError ? login.error.message : "Unable to sign in. Please try again."}</p>}
            <button className="w-full rounded-xl bg-brand px-5 py-3 font-bold text-white hover:opacity-90 disabled:opacity-60" type="submit" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}</button>
        </form>
    </AuthFormShell>;
}
