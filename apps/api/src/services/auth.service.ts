import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Prisma } from "../generated/prisma/client.js";
import { authRepository } from "../repositories/auth.repository.js";
import { AppError } from "../utils/app-error.js";
import { createRefreshToken, getRefreshSessionId, hashToken, REFRESH_TTL_MS, signAccessToken } from "../lib/auth-crypto.js";
import type { RegisterInput, LoginInput } from "../schemas/auth.schema.js";

// A short grace period avoids revoking sessions when two tabs refresh concurrently.
// A grace-period replay is rejected (401) but does not revoke the session.
export const REFRESH_REUSE_GRACE_MS = 5_000;

export type AuthUser = { id: string; email: string; name: string; role: "CUSTOMER" | "ADMIN" };

type LoginResult = { user: AuthUser; accessToken: string; refreshToken: string };

async function createLoginResult(user: AuthUser): Promise<LoginResult> {
    const sessionId = randomUUID();
    const refreshToken = createRefreshToken(sessionId);
    await authRepository.createSession({
        id: sessionId, userId: user.id, refreshTokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { user, accessToken: await signAccessToken(user.id, sessionId), refreshToken };
}

export const authService = {
    async register(input: RegisterInput): Promise<LoginResult> {
        const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
        let user: AuthUser;
        try {
            user = await authRepository.createUser({ name: input.name, email: input.email, passwordHash });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new AppError("Email is already registered", 409);
            }
            throw error;
        }
        return createLoginResult(user);
    },
    async login(input: LoginInput): Promise<LoginResult> {
        const user = await authRepository.findUserByEmail(input.email);
        // Always perform a password-hash comparison, including for absent users, to reduce timing differences.
        const passwordHash = user?.passwordHash ?? DUMMY_HASH;
        const correct = await argon2.verify(passwordHash, input.password);
        if (!user || !correct) throw new AppError("Invalid email or password", 401);
        return createLoginResult({ id: user.id, email: user.email, name: user.name, role: user.role });
    },
    async refresh(token: string | undefined): Promise<LoginResult> {
        const sessionId = token ? getRefreshSessionId(token) : null;
        if (!sessionId || !token) throw new AppError("Invalid session", 401);
        const session = await authRepository.findSession(sessionId);
        if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new AppError("Invalid session", 401);
        const incomingHash = hashToken(token);
        if (session.refreshTokenHash !== incomingHash) {
            // A token with a valid session ID but an unknown secret proves nothing.
            // Never let such a token revoke a legitimate user's session.
            if (session.previousRefreshTokenHash === incomingHash && session.previousRotatedAt) {
                const cutoff = new Date(Date.now() - REFRESH_REUSE_GRACE_MS);
                if (session.previousRotatedAt < cutoff) {
                    // Conditional update avoids revoking a session that rotated again meanwhile.
                    await authRepository.revokeReusedPreviousToken(sessionId, incomingHash, cutoff);
                    throw new AppError("Session revoked", 401);
                }
                // Likely simultaneous requests. Reject the stale token without revocation.
                throw new AppError("Session changed; retry with the latest cookie", 401);
            }
            throw new AppError("Invalid session", 401);
        }
        const user = await authRepository.findUserById(session.userId);
        if (!user) throw new AppError("Invalid session", 401);
        const newRefreshToken = createRefreshToken(sessionId);
        const result = await authRepository.rotateSession(sessionId, incomingHash, hashToken(newRefreshToken), new Date(Date.now() + REFRESH_TTL_MS));
        if (result.count !== 1) {
            // A concurrent request may have rotated the token. Do not revoke it based on a race.
            throw new AppError("Session changed; please sign in again", 401);
        }
        return { user, refreshToken: newRefreshToken, accessToken: await signAccessToken(user.id, sessionId) };
    },
    async logout(token: string | undefined): Promise<void> {
        const sessionId = token ? getRefreshSessionId(token) : null;
        if (sessionId && token) await authRepository.revokeMatchingSession(sessionId, hashToken(token));
    },
    async logoutAll(userId: string): Promise<void> {
        await authRepository.revokeAllSessions(userId);
    },
};

// An Argon2id hash of a fixed throwaway password (generated at build time).
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$Y5bOGk7lZxrlkiGYNwSVXQ$bTGHHyK0og5hZq3s1ccc1Db6HlzgpWowZf11Npt8L/M";
