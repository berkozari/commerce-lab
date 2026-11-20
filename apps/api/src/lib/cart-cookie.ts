import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

// Guest cart remains limited to /api/v1/cart, so it cannot use __Host-.
export const GUEST_CART_COOKIE = env.NODE_ENV === "production" ? "__Secure-cl_guest_cart" : "cl_guest_cart";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function newGuestToken(): string {
    return randomBytes(32).toString("base64url");
}

export function guestTokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function readGuestToken(req: Request): string | undefined {
    const token: unknown = req.cookies?.[GUEST_CART_COOKIE];
    return typeof token === "string" && tokenPattern.test(token) ? token : undefined;
}

export function setGuestCartCookie(res: Response, token: string): void {
    res.cookie(GUEST_CART_COOKIE, token, {
        httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax",
        path: "/api/v1/cart", maxAge: MAX_AGE,
    });
}

export function clearGuestCartCookie(res: Response): void {
    res.clearCookie(GUEST_CART_COOKIE, {
        httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax",
        path: "/api/v1/cart",
    });
}
