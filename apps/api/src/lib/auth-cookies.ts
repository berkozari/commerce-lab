import type { Response } from "express";
import { isProduction, ACCESS_TTL_SECONDS, REFRESH_TTL_MS } from "./auth-crypto.js";

export const ACCESS_COOKIE = "cl_access";
export const REFRESH_COOKIE = "cl_refresh";
export const CSRF_COOKIE = "cl_csrf";

const base = { secure: isProduction, sameSite: "lax" as const };

export function setAuthCookies(res: Response, access: string, refresh: string): void {
    res.cookie(ACCESS_COOKIE, access, { ...base, httpOnly: true, path: "/", maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...base, httpOnly: true, path: "/api/v1/auth", maxAge: REFRESH_TTL_MS });
}

export function setCsrfCookie(res: Response, token: string): void {
    res.cookie(CSRF_COOKIE, token, { ...base, httpOnly: false, path: "/", maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: "/" });
    res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: "/api/v1/auth" });
}
