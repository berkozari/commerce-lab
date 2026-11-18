import type { RequestHandler } from "express";
import { authRepository } from "../repositories/auth.repository.js";
import { verifyAccessToken } from "../lib/auth-crypto.js";
import { ACCESS_COOKIE } from "../lib/auth-cookies.js";
import { guestTokenHash, newGuestToken, readGuestToken, setGuestCartCookie } from "../lib/cart-cookie.js";
import { AppError } from "../utils/app-error.js";

export type CartIdentity =
    | { kind: "user"; userId: string }
    | { kind: "guest"; tokenHash: string };

export const resolveCartIdentity: RequestHandler = async (req, res, next) => {
    try {
        const rawAccess: unknown = req.cookies?.[ACCESS_COOKIE];
        if (rawAccess !== undefined) {
            if (typeof rawAccess !== "string") throw new AppError("Invalid session", 401);
            let verified: { userId: string; sessionId: string };
            try {
                verified = await verifyAccessToken(rawAccess);
            } catch {
                throw new AppError("Invalid or expired session", 401);
            }
            const session = await authRepository.findSession(verified.sessionId);
            if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== verified.userId) {
                throw new AppError("Session expired or revoked", 401);
            }
            res.locals.cartIdentity = { kind: "user", userId: verified.userId } satisfies CartIdentity;
            next();
            return;
        }

        let token = readGuestToken(req);
        if (!token) {
            token = newGuestToken();
            setGuestCartCookie(res, token);
        }
        res.locals.cartIdentity = { kind: "guest", tokenHash: guestTokenHash(token) } satisfies CartIdentity;
        next();
    } catch (error) {
        next(error);
    }
};

export function getCartIdentity(locals: Record<string, unknown>): CartIdentity {
    const identity = locals.cartIdentity as CartIdentity | undefined;
    if (!identity) throw new Error("Cart identity middleware must run before cart routes");
    return identity;
}
