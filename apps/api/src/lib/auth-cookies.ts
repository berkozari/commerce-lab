import type { Response } from "express";
import { isProduction, ACCESS_TTL_SECONDS, REFRESH_TTL_MS } from "./auth-crypto.js";

// Browsers only accept __Host- cookies over HTTPS with Secure, Path=/,
// and no Domain attribute. Refresh is path-scoped, so it uses __Secure-
// instead. Keep existing names for localhost HTTP development.
export const ACCESS_COOKIE = isProduction ? "__Host-cl_access" : "cl_access";
export const REFRESH_COOKIE = isProduction ? "__Secure-cl_refresh" : "cl_refresh";
export const CSRF_COOKIE = isProduction ? "__Host-cl_csrf" : "cl_csrf";

const base = { secure: isProduction, sameSite: "lax" as const };

export function setAuthCookies(res: Response, access: string, refresh: string): void {
    res.cookie(ACCESS_COOKIE, access, { ...base, httpOnly: true, path: "/", maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...base, httpOnly: true, path: "/api/v1/auth", maxAge: REFRESH_TTL_MS });
}

export function setCsrfCookie(res: Response, token: string): void {
    // JavaScript obtains the signed token from GET /auth/csrf; this cookie
    // must remain readable for the double-submit policy, unlike auth cookies.
    res.cookie(CSRF_COOKIE, token, { ...base, httpOnly: false, path: "/", maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response): void {
    // Cookie deletion must match the name, path and security attributes
    // used when setting the cookie.
    res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: "/" });
    res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: "/api/v1/auth" });
}
