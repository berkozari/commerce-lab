import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Database-free tests: preserve the real service, repository, JWT and HTTP route
// behavior while replacing only the Prisma connection with spies.
const prismaMock = vi.hoisted(() => ({
    updateMany: vi.fn(),
    findSession: vi.fn(),
    findUser: vi.fn(),
}));

vi.mock("../../src/config/database.js", () => ({
    getPrisma: () => ({
        authSession: {
            updateMany: prismaMock.updateMany,
            findUnique: prismaMock.findSession,
        },
        user: { findUnique: prismaMock.findUser },
    }),
}));

process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";

const { authService } = await import("../../src/services/auth.service.js");
const { requireAuth } = await import("../../src/middlewares/auth.middleware.js");
const { createRefreshToken, hashToken, signAccessToken } = await import("../../src/lib/auth-crypto.js");
const { app } = await import("../../src/app.js");

const userId = randomUUID();
const sessionId = randomUUID();
const currentToken = createRefreshToken(sessionId);
const previousToken = createRefreshToken(sessionId);
const forgedToken = createRefreshToken(sessionId);
const user = { id: userId, email: "account@example.test", name: "Account", role: "CUSTOMER" as const };

function session(overrides: Record<string, unknown> = {}) {
    return {
        id: sessionId,
        userId,
        refreshTokenHash: hashToken(currentToken),
        previousRefreshTokenHash: hashToken(previousToken),
        previousRotatedAt: new Date(),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.findSession.mockResolvedValue(session());
    prismaMock.findUser.mockResolvedValue(user);
});

describe("logout and session revocation", () => {
    it.each([
        ["current", currentToken],
        ["just-rotated previous", previousToken],
    ])("revokes by the %s refresh token hash using a conditional query", async (_label, token) => {
        await authService.logout(token);

        expect(prismaMock.updateMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.updateMany).toHaveBeenCalledWith({
            where: {
                id: sessionId,
                revokedAt: null,
                OR: [
                    { refreshTokenHash: hashToken(token) },
                    { previousRefreshTokenHash: hashToken(token) },
                ],
            },
            data: { revokedAt: expect.any(Date) },
        });
    });

    it("cannot revoke a legitimate session merely by knowing its UUID", async () => {
        // Simulate Prisma updateMany using the real query shape and persisted hashes.
        const saved = session();
        prismaMock.updateMany.mockImplementation(async ({ where }) => {
            const suppliedHash = where.OR?.[0]?.refreshTokenHash;
            const matches = where.id === saved.id && !saved.revokedAt &&
                (suppliedHash === saved.refreshTokenHash || suppliedHash === saved.previousRefreshTokenHash);
            return { count: matches ? 1 : 0 };
        });

        await expect(authService.logout(forgedToken)).resolves.toBeUndefined();
        expect(prismaMock.updateMany).toHaveBeenCalledTimes(1);
        expect(await prismaMock.updateMany.mock.results[0].value).toEqual({ count: 0 });
    });

    it("treats missing or malformed refresh tokens as an idempotent logout", async () => {
        await authService.logout(undefined);
        await authService.logout("invalid-token");
        expect(prismaMock.updateMany).not.toHaveBeenCalled();
    });

    it("logout-all updates only non-revoked sessions belonging to the given user", async () => {
        await authService.logoutAll(userId);
        expect(prismaMock.updateMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.updateMany).toHaveBeenCalledWith({
            where: { userId, revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });

    it.each([
        ["revoked", { revokedAt: new Date() }],
        ["expired", { expiresAt: new Date(Date.now() - 1000) }],
        ["wrong user", { userId: randomUUID() }],
    ])("requireAuth rejects a %s session even with a correctly signed access token", async (_label, overrides) => {
        prismaMock.findSession.mockResolvedValue(session(overrides));
        const access = await signAccessToken(userId, sessionId);
        const req = { cookies: { cl_access: access } } as unknown as Request;
        const next = vi.fn() as NextFunction;
        await requireAuth(req, {} as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
        expect(prismaMock.findUser).not.toHaveBeenCalled();
    });

    it("requireAuth accepts only an active, matching session", async () => {
        const access = await signAccessToken(userId, sessionId);
        const req = { cookies: { cl_access: access } } as unknown as Request;
        const next = vi.fn() as NextFunction;
        await requireAuth(req, {} as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
        expect(req.auth).toMatchObject({ sessionId, user });
    });

    it("HTTP logout clears access and refresh cookies with their respective paths", async () => {
        const csrf = await request(app).get("/api/v1/auth/csrf");
        const csrfCookies = (csrf.headers["set-cookie"] as unknown as string[]).map((value) => value.split(";")[0]);
        const result = await request(app).post("/api/v1/auth/logout")
            .set("Cookie", [...csrfCookies, `cl_refresh=${previousToken}`])
            .set("x-csrf-token", csrf.body.data.csrfToken);

        expect(result.status).toBe(200);
        expect(result.body.data.loggedOut).toBe(true);
        const cookies = result.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((cookie) => cookie.startsWith("cl_access=") && cookie.includes("Path=/"))).toBe(true);
        expect(cookies.some((cookie) => cookie.startsWith("cl_refresh=") && cookie.includes("Path=/api/v1/auth"))).toBe(true);
        expect(prismaMock.updateMany).toHaveBeenCalledOnce();
    });

    it("HTTP logout-all requires authentication; a missing access token cannot revoke other sessions", async () => {
        const csrf = await request(app).get("/api/v1/auth/csrf");
        const csrfCookies = (csrf.headers["set-cookie"] as unknown as string[]).map((value) => value.split(";")[0]);
        const result = await request(app).post("/api/v1/auth/logout-all")
            .set("Cookie", csrfCookies)
            .set("x-csrf-token", csrf.body.data.csrfToken);

        expect(result.status).toBe(401);
        expect(prismaMock.updateMany).not.toHaveBeenCalled();
    });

    it("HTTP logout-all revokes this user's sessions after verifying the access token", async () => {
        const csrf = await request(app).get("/api/v1/auth/csrf");
        const csrfCookies = (csrf.headers["set-cookie"] as unknown as string[]).map((value) => value.split(";")[0]);
        const access = await signAccessToken(userId, sessionId);
        const result = await request(app).post("/api/v1/auth/logout-all")
            .set("Cookie", [...csrfCookies, `cl_access=${access}`])
            .set("x-csrf-token", csrf.body.data.csrfToken);

        expect(result.status).toBe(200);
        expect(result.body.data.loggedOut).toBe(true);
        expect(prismaMock.updateMany).toHaveBeenCalledWith({
            where: { userId, revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });
});
