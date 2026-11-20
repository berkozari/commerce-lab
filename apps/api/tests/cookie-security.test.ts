import type { Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test imports modules after setting NODE_ENV: env and cookie name
// constants are intentionally computed once when the API starts.
beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CORS_ORIGIN", "http://127.0.0.1:5173");
    vi.stubEnv("AUTH_JWT_SECRET", "cookie-security-test-jwt-secret-00000000000000000");
    vi.stubEnv("AUTH_CSRF_SECRET", "cookie-security-test-csrf-secret-0000000000000000");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

function cookieSpy() {
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    return { cookie, clearCookie, res: { cookie, clearCookie } as unknown as Response };
}

describe("EC-013.3.2: secure cookie contracts", () => {
    it("keeps localhost development cookie names and HTTP compatibility", async () => {
        const auth = await import("../src/lib/auth-cookies.js");
        const guest = await import("../src/lib/cart-cookie.js");
        const { cookie, res } = cookieSpy();
        expect([auth.ACCESS_COOKIE, auth.REFRESH_COOKIE, auth.CSRF_COOKIE, guest.GUEST_CART_COOKIE]).toEqual([
            "cl_access", "cl_refresh", "cl_csrf", "cl_guest_cart",
        ]);
        auth.setAuthCookies(res, "access-token", "refresh-token");
        expect(cookie).toHaveBeenCalledWith("cl_access", "access-token", expect.objectContaining({
            secure: false, httpOnly: true, sameSite: "lax", path: "/", maxAge: 900_000,
        }));
        expect(cookie).toHaveBeenCalledWith("cl_refresh", "refresh-token", expect.objectContaining({
            secure: false, httpOnly: true, path: "/api/v1/auth",
        }));
    });

    it("uses host-bound production cookies, HTTPS, and a path-scoped refresh token", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CORS_ORIGIN", "https://shop.example.test");
        const auth = await import("../src/lib/auth-cookies.js");
        const guest = await import("../src/lib/cart-cookie.js");
        const { cookie, clearCookie, res } = cookieSpy();

        expect(auth.ACCESS_COOKIE).toBe("__Host-cl_access");
        expect(auth.CSRF_COOKIE).toBe("__Host-cl_csrf");
        expect(auth.REFRESH_COOKIE).toBe("__Secure-cl_refresh");
        expect(guest.GUEST_CART_COOKIE).toBe("__Secure-cl_guest_cart");

        auth.setAuthCookies(res, "access-token", "refresh-token");
        auth.setCsrfCookie(res, "csrf-token");
        guest.setGuestCartCookie(res, "guest-token");
        expect(cookie).toHaveBeenCalledWith("__Host-cl_access", "access-token", expect.objectContaining({
            secure: true, sameSite: "lax", httpOnly: true, path: "/", maxAge: 900_000,
        }));
        expect(cookie).toHaveBeenCalledWith("__Secure-cl_refresh", "refresh-token", expect.objectContaining({
            secure: true, sameSite: "lax", httpOnly: true, path: "/api/v1/auth",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        }));
        expect(cookie).toHaveBeenCalledWith("__Host-cl_csrf", "csrf-token", expect.objectContaining({
            secure: true, sameSite: "lax", httpOnly: false, path: "/",
        }));
        expect(cookie).toHaveBeenCalledWith("__Secure-cl_guest_cart", "guest-token", expect.objectContaining({
            secure: true, sameSite: "lax", httpOnly: true, path: "/api/v1/cart",
        }));
        // Domain must be absent for __Host- cookies to be browser-accepted.
        for (const [name, , options] of cookie.mock.calls) {
            if (String(name).startsWith("__Host-")) expect(options).not.toHaveProperty("domain");
        }
        auth.clearAuthCookies(res);
        guest.clearGuestCartCookie(res);
        expect(clearCookie).toHaveBeenCalledWith("__Host-cl_access", expect.objectContaining({
            secure: true, path: "/",
        }));
        expect(clearCookie).toHaveBeenCalledWith("__Secure-cl_refresh", expect.objectContaining({
            secure: true, path: "/api/v1/auth",
        }));
        expect(clearCookie).toHaveBeenCalledWith("__Secure-cl_guest_cart", expect.objectContaining({
            secure: true, path: "/api/v1/cart",
        }));
    });

    it("does not accept an HTTP frontend origin in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CORS_ORIGIN", "http://shop.example.test");
        await expect(import("../src/config/env.js")).rejects.toThrow("CORS_ORIGIN");
    });

    it.each([
        "https://shop.example.test/",
        "https://shop.example.test/custom-path",
        "ftp://shop.example.test",
    ])("rejects non-exact or non-HTTP(S) origin %s", async (badOrigin) => {
        vi.stubEnv("CORS_ORIGIN", badOrigin);
        await expect(import("../src/config/env.js")).rejects.toThrow("CORS_ORIGIN");
    });

    it("prevents caching for CSRF and unauthenticated private auth responses", async () => {
        const { app } = await import("../src/app.js");
        const csrf = await request(app).get("/api/v1/auth/csrf");
        const me = await request(app).get("/api/v1/auth/me");
        const loginRejected = await request(app).post("/api/v1/auth/login").send({});
        expect(csrf.status).toBe(200);
        expect(me.status).toBe(401);
        expect(loginRejected.status).toBe(403);
        for (const response of [csrf, me, loginRejected]) {
            expect(response.headers["cache-control"]).toContain("no-store");
        }
    });
});
