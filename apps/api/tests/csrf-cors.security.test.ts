import request from "supertest";
import { describe, expect, it } from "vitest";

// These HTTP boundary tests never need a database: all accepted mutations end
// in request validation and all rejected mutations end in CSRF middleware.
process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";

const { app } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");

const csrfPath = "/api/v1/auth/csrf";
const loginPath = "/api/v1/auth/login";
const hostileOrigin = "https://untrusted.example";
const invalidLogin = { email: "not-an-email", password: "x" };

async function csrfChallenge(): Promise<{ token: string; cookie: string }> {
    const response = await request(app).get(csrfPath);
    expect(response.status).toBe(200);
    const setCookies = response.headers["set-cookie"] as unknown as string[];
    const csrfCookie = setCookies.find((item) => item.startsWith("cl_csrf="));
    expect(csrfCookie).toBeDefined();
    return {
        token: response.body.data.csrfToken as string,
        cookie: csrfCookie!.split(";")[0]!,
    };
}

describe("EC-013.3.1: CSRF challenge", () => {
    it("sets a signed CSRF cookie and prevents response caching", async () => {
        const response = await request(app).get(csrfPath);
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toContain("no-store");
        expect(response.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
        const cookies = response.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((cookie) => cookie.startsWith("cl_csrf=") && cookie.includes("Path=/") && cookie.includes("SameSite=Lax"))).toBe(true);
    });

    it("reuses a valid signed cookie across repeated challenges", async () => {
        const first = await csrfChallenge();
        const second = await request(app).get(csrfPath).set("Cookie", first.cookie);
        expect(second.status).toBe(200);
        expect(second.body.data.csrfToken).toBe(first.token);
        const cookies = second.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((cookie) => cookie.startsWith(first.cookie + ";"))).toBe(true);
    });

    it("replaces an invalid CSRF cookie instead of trusting its value", async () => {
        const first = await csrfChallenge();
        const forged = first.cookie + "tampered";
        const second = await request(app).get(csrfPath).set("Cookie", forged);
        expect(second.status).toBe(200);
        expect(second.body.data.csrfToken).not.toBe(first.token);
        expect(second.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    });
});

describe("EC-013.3.1: CSRF mutation boundary", () => {
    it("rejects a missing token", async () => {
        const response = await request(app).post(loginPath).send(invalidLogin);
        expect(response.status).toBe(403);
    });

    it("rejects a header that differs from the signed cookie", async () => {
        const csrf = await csrfChallenge();
        const response = await request(app).post(loginPath)
            .set("Cookie", csrf.cookie)
            .set("x-csrf-token", csrf.token + "x")
            .send(invalidLogin);
        expect(response.status).toBe(403);
    });

    it("rejects a hostile Origin even with a valid CSRF token", async () => {
        const csrf = await csrfChallenge();
        const response = await request(app).post(loginPath)
            .set("Cookie", csrf.cookie)
            .set("x-csrf-token", csrf.token)
            .set("Origin", hostileOrigin)
            .send(invalidLogin);
        expect(response.status).toBe(403);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("rejects Sec-Fetch-Site: cross-site even when Origin is absent", async () => {
        const csrf = await csrfChallenge();
        const response = await request(app).post(loginPath)
            .set("Cookie", csrf.cookie)
            .set("x-csrf-token", csrf.token)
            .set("Sec-Fetch-Site", "cross-site")
            .send(invalidLogin);
        expect(response.status).toBe(403);
    });

    it("accepts the configured Origin and passes CSRF to normal body validation", async () => {
        const csrf = await csrfChallenge();
        const response = await request(app).post(loginPath)
            .set("Cookie", csrf.cookie)
            .set("x-csrf-token", csrf.token)
            .set("Origin", env.CORS_ORIGIN)
            .send(invalidLogin);
        expect(response.status).toBe(400);
        expect(response.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
    });

    it("allows a non-browser client with a valid signed CSRF cookie/header and no Origin", async () => {
        const csrf = await csrfChallenge();
        const response = await request(app).post(loginPath)
            .set("Cookie", csrf.cookie)
            .set("x-csrf-token", csrf.token)
            .send(invalidLogin);
        expect(response.status).toBe(400);
    });
});

describe("EC-013.3.1: credentialed CORS policy", () => {
    it("allows only the configured frontend Origin with credentials", async () => {
        const response = await request(app).get("/api/v1/health").set("Origin", env.CORS_ORIGIN);
        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not advertise a trusted CORS origin to an untrusted Origin", async () => {
        const response = await request(app).get("/api/v1/health").set("Origin", hostileOrigin);
        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
        expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("permits a trusted credentialed preflight with the CSRF header", async () => {
        const response = await request(app).options(loginPath)
            .set("Origin", env.CORS_ORIGIN)
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
        expect(response.status).toBe(204);
        expect(response.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
        expect(response.headers["access-control-allow-headers"]).toContain("x-csrf-token");
    });

    it("never authorizes an untrusted preflight", async () => {
        const response = await request(app).options(loginPath)
            .set("Origin", hostileOrigin)
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
        expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    });
});
