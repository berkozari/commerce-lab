import { getPrisma } from "../config/database.js";

export const authRepository = {
    findUserByEmail: (email: string) => getPrisma().user.findUnique({ where: { email } }),
    findUserById: (id: string) => getPrisma().user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true } }),
    createUser: (data: { email: string; name: string; passwordHash: string }) => getPrisma().user.create({ data, select: { id: true, email: true, name: true, role: true } }),
    createSession: (data: { id: string; userId: string; refreshTokenHash: string; expiresAt: Date }) => getPrisma().authSession.create({ data }),
    findSession: (id: string) => getPrisma().authSession.findUnique({ where: { id } }),
    rotateSession: (id: string, previousHash: string, nextHash: string, expiresAt: Date) => getPrisma().authSession.updateMany({
        where: { id, refreshTokenHash: previousHash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { refreshTokenHash: nextHash, previousRefreshTokenHash: previousHash, previousRotatedAt: new Date(), expiresAt },
    }),
    revokeReusedPreviousToken: (id: string, previousHash: string, cutoff: Date) => getPrisma().authSession.updateMany({
        where: { id, previousRefreshTokenHash: previousHash, previousRotatedAt: { lt: cutoff }, revokedAt: null },
        data: { revokedAt: new Date() },
    }),
    revokeSession: (id: string) => getPrisma().authSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),
    // Logout should also accept the last genuinely issued refresh token. A tab may
    // send it just after another tab rotates the cookie. Unknown/forged secrets do
    // not match either hash, so they cannot revoke a session by guessing its ID.
    revokeMatchingSession: (id: string, refreshTokenHash: string) => getPrisma().authSession.updateMany({
        where: {
            id,
            revokedAt: null,
            OR: [
                { refreshTokenHash },
                { previousRefreshTokenHash: refreshTokenHash },
            ],
        },
        data: { revokedAt: new Date() },
    }),
    revokeAllSessions: (userId: string) => getPrisma().authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
};
