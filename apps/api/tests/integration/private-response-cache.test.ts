import request from "supertest";
import { describe, expect, it } from "vitest";

// Only unauthorized responses are requested; no database access is needed.
process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";

const { app } = await import("../../src/app.js");

describe("private HTTP responses", () => {
    it.each([
        ["customer order list", "GET", "/api/v1/orders", 401],
        ["customer order detail", "GET", "/api/v1/orders/01234567-89ab-4def-8123-456789abcdef", 401],
        ["admin orders", "GET", "/api/v1/admin/orders", 401],
        ["admin catalog", "GET", "/api/v1/admin/products", 401],
        ["checkout", "POST", "/api/v1/checkout", 403],
    ] as const)("sets no-store on %s", async (_name, method, path, status) => {
        const response = method === "POST" ? await request(app).post(path) : await request(app).get(path);
        expect(response.status).toBe(status);
        expect(response.headers["cache-control"]).toContain("no-store");
    });
});
