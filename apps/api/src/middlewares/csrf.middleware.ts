import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { CSRF_COOKIE } from "../lib/auth-cookies.js";
import { isValidCsrfToken } from "../lib/auth-crypto.js";
import { AppError } from "../utils/app-error.js";

export const requireCsrf: RequestHandler = (req, _res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) { next(); return; }
    const origin = req.get("origin");
    // Origin is sent by browsers for credentialed cross-origin requests.
    if (origin && origin !== env.CORS_ORIGIN) { next(new AppError("Origin not allowed", 403)); return; }
    if (!isValidCsrfToken(req.cookies?.[CSRF_COOKIE], req.get("x-csrf-token"))) {
        next(new AppError("Invalid CSRF token", 403)); return;
    }
    next();
};
