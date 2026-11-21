import { beforeAll, describe, expect, it } from "vitest";

let createRefreshToken: typeof import("../../src/lib/auth-crypto.js")["createRefreshToken"];
let getRefreshSessionId: typeof import("../../src/lib/auth-crypto.js")["getRefreshSessionId"];
let hashToken: typeof import("../../src/lib/auth-crypto.js")["hashToken"];
let createCsrfToken: typeof import("../../src/lib/auth-crypto.js")["createCsrfToken"];
let isValidCsrfToken: typeof import("../../src/lib/auth-crypto.js")["isValidCsrfToken"];

beforeAll(async () => {
    process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
    process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";
    ({ createRefreshToken, getRefreshSessionId, hashToken, createCsrfToken, isValidCsrfToken } = await import("../../src/lib/auth-crypto.js"));
});

describe("Auth token primitives", () => {
    it("creates distinct, non-reversible refresh hashes", () => {
        const id = "e9b0d604-57da-499c-8fdc-cae6c523753b";
        const first = createRefreshToken(id);
        const second = createRefreshToken(id);
        expect(first).not.toBe(second);
        expect(getRefreshSessionId(first)).toBe(id);
        expect(hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
        expect(hashToken(first)).not.toBe(first);
    });
    it("rejects modified CSRF token", () => {
        const token = createCsrfToken();
        expect(isValidCsrfToken(token, token)).toBe(true);
        expect(isValidCsrfToken(token, token + "x")).toBe(false);
        expect(isValidCsrfToken(token, "garbage")).toBe(false);
    });
});
