import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRefreshToken, hashToken } from "../src/lib/auth-crypto.js";

const mock = vi.hoisted(() => ({
    findSession: vi.fn(),
    findUserById: vi.fn(),
    rotateSession: vi.fn(),
    revokeReusedPreviousToken: vi.fn(),
    revokeSession: vi.fn(),
}));

vi.mock("../src/repositories/auth.repository.js", () => ({
    authRepository: mock,
}));

vi.mock("../src/lib/auth-crypto.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/lib/auth-crypto.js")>()),
    signAccessToken: vi.fn().mockResolvedValue("test-access-token"),
}));

const { authService, REFRESH_REUSE_GRACE_MS } = await import("../src/services/auth.service.js");

const user = { id: randomUUID(), email: "customer@example.test", name: "Customer", role: "CUSTOMER" as const };
const sessionId = randomUUID();
const currentToken = createRefreshToken(sessionId);
const oldToken = createRefreshToken(sessionId);

function session(overrides: Record<string, unknown> = {}) {
    return {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: hashToken(currentToken),
        previousRefreshTokenHash: hashToken(oldToken),
        previousRotatedAt: new Date(),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mock.findSession.mockResolvedValue(session());
    mock.findUserById.mockResolvedValue(user);
    mock.rotateSession.mockResolvedValue({ count: 1 });
    mock.revokeReusedPreviousToken.mockResolvedValue({ count: 1 });
});

describe("refresh token rotation safety", () => {
    it("rotates a legitimate refresh token and records the old token hash conditionally", async () => {
        const result = await authService.refresh(currentToken);
        expect(result.user).toEqual(user);
        expect(result.refreshToken).not.toBe(currentToken);
        expect(mock.rotateSession).toHaveBeenCalledWith(
            sessionId, hashToken(currentToken), hashToken(result.refreshToken), expect.any(Date),
        );
        expect(mock.revokeReusedPreviousToken).not.toHaveBeenCalled();
    });

    it("does not revoke a legitimate session for a random forged token with a known session ID", async () => {
        await expect(authService.refresh(createRefreshToken(sessionId))).rejects.toMatchObject({ statusCode: 401 });
        expect(mock.revokeReusedPreviousToken).not.toHaveBeenCalled();
        expect(mock.revokeSession).not.toHaveBeenCalled();
    });

    it("rejects an immediately repeated old token without revocation (concurrent tab grace)", async () => {
        await expect(authService.refresh(oldToken)).rejects.toMatchObject({ statusCode: 401 });
        expect(mock.revokeReusedPreviousToken).not.toHaveBeenCalled();
    });

    it("revokes a session when the known old token is replayed after the grace window", async () => {
        const rotatedAt = new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 60_000);
        mock.findSession.mockResolvedValue(session({ previousRotatedAt: rotatedAt }));
        await expect(authService.refresh(oldToken)).rejects.toMatchObject({ statusCode: 401 });
        expect(mock.revokeReusedPreviousToken).toHaveBeenCalledWith(
            sessionId, hashToken(oldToken), expect.any(Date),
        );
    });

    it("does not revoke when a conditional rotation loses an optimistic concurrency race", async () => {
        mock.rotateSession.mockResolvedValue({ count: 0 });
        await expect(authService.refresh(currentToken)).rejects.toMatchObject({ statusCode: 401 });
        expect(mock.revokeReusedPreviousToken).not.toHaveBeenCalled();
        expect(mock.revokeSession).not.toHaveBeenCalled();
    });
});
