import { Router } from "express";
import { authRateLimit, refreshRateLimit } from "../middlewares/auth-rate-limit.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireCsrf } from "../middlewares/csrf.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";
import { authService } from "../services/auth.service.js";
import { createCsrfToken, isValidCsrfToken } from "../lib/auth-crypto.js";
import { clearAuthCookies, CSRF_COOKIE, REFRESH_COOKIE, setAuthCookies, setCsrfCookie } from "../lib/auth-cookies.js";

export const authRouter = Router();

// Authentication endpoints include private user data and Set-Cookie responses.
// Prevent intermediaries and browsers from caching even error/401 responses.
authRouter.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

authRouter.get("/csrf", (req, res) => {
    const existingToken: unknown = req.cookies?.[CSRF_COOKIE];
    // Multiple tabs may fetch /csrf concurrently. Reuse a valid signed token
    // rather than rotating the cookie out from under an in-flight mutation.
    const csrfToken = typeof existingToken === "string" && isValidCsrfToken(existingToken, existingToken)
        ? existingToken
        : createCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.status(200).json({ success: true, data: { csrfToken } });
});

authRouter.post("/register", authRateLimit, requireCsrf, validateBody(registerSchema), async (req, res) => {
    const result = await authService.register(req.body);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json({ success: true, data: { user: result.user } });
});

authRouter.post("/login", authRateLimit, requireCsrf, validateBody(loginSchema), async (req, res) => {
    const result = await authService.login(req.body);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user } });
});

authRouter.post("/refresh", refreshRateLimit, requireCsrf, async (req, res) => {
    const result = await authService.refresh(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user } });
});

authRouter.post("/logout", requireCsrf, async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(res);
    res.status(200).json({ success: true, data: { loggedOut: true } });
});

authRouter.post("/logout-all", requireCsrf, requireAuth, async (req, res) => {
    await authService.logoutAll(req.auth!.user.id);
    clearAuthCookies(res);
    res.status(200).json({ success: true, data: { loggedOut: true } });
});

authRouter.get("/me", requireAuth, (req, res) => {
    res.status(200).json({ success: true, data: { user: req.auth!.user } });
});
