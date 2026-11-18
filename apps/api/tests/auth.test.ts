import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

let app: typeof import("../src/app.js")["app"];

beforeAll(async () => {
    process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
    process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";
    ({ app } = await import("../src/app.js"));
});

describe("Authentication API boundaries (database-free)", () => {
    it("issues an authenticated CSRF challenge and cookie", async () => {
        const res = await request(app).get("/api/v1/auth/csrf");
        expect(res.status).toBe(200);
        expect(res.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("rejects mutation without CSRF token", async () => {
        const res = await request(app).post("/api/v1/auth/login").send({ email: "a@b.com", password: "test" });
        expect(res.status).toBe(403);
    });

    it("rejects invalid registration before touching the database", async () => {
        const csrf = await request(app).get("/api/v1/auth/csrf");
        const cookie = csrf.headers["set-cookie"];
        const res = await request(app).post("/api/v1/auth/register")
            .set("Cookie", cookie).set("x-csrf-token", csrf.body.data.csrfToken)
            .send({ name: "A", email: "invalid", password: "short" });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it("rejects unauthenticated access to me", async () => {
        const res = await request(app).get("/api/v1/auth/me");
        expect(res.status).toBe(401);
    });
});
