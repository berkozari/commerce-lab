import request from "supertest";
import { describe, expect, it } from "vitest";

// HTTP-only verification: no database connection or session fixtures required.
process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";

const { app } = await import("../../src/app.js");

const requiredHeaders = [
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
];

describe("EC-013.5.1: HTTP security headers", () => {
    it.each([
        ["health success", "/api/v1/health", 200],
        ["CSRF issuance", "/api/v1/auth/csrf", 200],
        ["private auth rejection", "/api/v1/auth/me", 401],
        ["not-found response", "/api/v1/no-such-route", 404],
    ] as const)("applies Helmet headers on %s", async (_name, path, status) => {
        const response = await request(app).get(path);
        expect(response.status).toBe(status);
        for (const header of requiredHeaders) {
            expect(response.headers[header], `missing ${header} on ${path}`).toBeDefined();
        }
        expect(response.headers["x-powered-by"]).toBeUndefined();
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("uses a restrictive default CSP and does not expose X-Powered-By", async () => {
        const response = await request(app).get("/api/v1/health");
        expect(response.status).toBe(200);
        expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
        expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    it("also protects rejected cross-site mutations", async () => {
        const response = await request(app)
            .post("/api/v1/auth/login")
            .set("Origin", "https://hostile.example")
            .send({ email: "test@example.test", password: "invalid" });
        expect(response.status).toBe(403);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["cache-control"]).toContain("no-store");
    });
});
