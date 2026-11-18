
import type { RequestHandler } from "express";

import { authRepository } from "../repositories/auth.repository.js";
import { verifyAccessToken } from "../lib/auth-crypto.js";
import { ACCESS_COOKIE } from "../lib/auth-cookies.js";
import { AppError } from "../utils/app-error.js";

import type { AuthUser } from "../services/auth.service.js";

export const requireAuth: RequestHandler = async (
    req,
    _res,
    next,
) => {
    try {
        const token = req.cookies?.[ACCESS_COOKIE] as
            | string
            | undefined;

        if (!token) {
            throw new AppError("Authentication required", 401);
        }

        let verified: {
            userId: string;
            sessionId: string;
        };

        try {
            verified = await verifyAccessToken(token);
        } catch {
            throw new AppError(
                "Invalid or expired access token",
                401,
            );
        }

        const session = await authRepository.findSession(
            verified.sessionId,
        );

        if (
            !session ||
            session.revokedAt ||
            session.expiresAt <= new Date() ||
            session.userId !== verified.userId
        ) {
            throw new AppError(
                "Session expired or revoked",
                401,
            );
        }

        const user = await authRepository.findUserById(
            verified.userId,
        );

        if (!user) {
            throw new AppError("Authentication required", 401);
        }

        req.auth = {
            user,
            sessionId: session.id,
        };

        next();
    } catch (error) {
        next(error);
    }
};

export function requireRole(
    ...roles: AuthUser["role"][]
): RequestHandler {
    return (req, _res, next) => {
        if (!req.auth) {
            next(new AppError("Authentication required", 401));
            return;
        }

        if (!roles.includes(req.auth.user.role)) {
            next(new AppError("Forbidden", 403));
            return;
        }

        next();
    };
}
