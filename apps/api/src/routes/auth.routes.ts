import { Router } from "express";
import { authRateLimit } from "../middlewares/auth-rate-limit.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireCsrf } from "../middlewares/csrf.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";
import { authService } from "../services/auth.service.js";
import { createCsrfToken } from "../lib/auth-crypto.js";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies, setCsrfCookie } from "../lib/auth-cookies.js";

export const authRouter = Router();

authRouter.get("/csrf", (_req, res) => {
    const csrfToken = createCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.setHeader("Cache-Control", "no-store");
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

authRouter.post("/refresh", authRateLimit, requireCsrf, async (req, res) => {
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
