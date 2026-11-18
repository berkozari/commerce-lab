import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env, requireAuthSecrets } from "../config/env.js";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createRefreshToken(sessionId: string): string {
    return `${sessionId}.${randomBytes(32).toString("base64url")}`;
}

export function getRefreshSessionId(token: string): string | null {
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(token);
    return match ? match[1] : null;
}

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
    const { jwtSecret } = requireAuthSecrets();
    return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(userId)
        .setIssuer("commerce-lab-api")
        .setAudience("commerce-lab-web")
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
        .sign(new TextEncoder().encode(jwtSecret));
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; sessionId: string }> {
    const { jwtSecret } = requireAuthSecrets();
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
        algorithms: ["HS256"], issuer: "commerce-lab-api", audience: "commerce-lab-web",
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw new Error("Invalid claims");
    return { userId: payload.sub, sessionId: payload.sid };
}

function csrfSignature(nonce: string): string {
    const { csrfSecret } = requireAuthSecrets();
    return createHmac("sha256", csrfSecret).update(nonce).digest("base64url");
}

export function createCsrfToken(): string {
    const nonce = randomBytes(32).toString("base64url");
    return `${nonce}.${csrfSignature(nonce)}`;
}

export function isValidCsrfToken(cookieToken: unknown, headerToken: unknown): boolean {
    if (typeof cookieToken !== "string" || typeof headerToken !== "string" || cookieToken !== headerToken) return false;
    const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(cookieToken);
    if (!match) return false;
    const expected = Buffer.from(csrfSignature(match[1]));
    const received = Buffer.from(match[2]);
    return expected.length === received.length && timingSafeEqual(expected, received);
}

export const isProduction = env.NODE_ENV === "production";
