import { rateLimit } from "express-rate-limit";

// A single-process baseline limiter. Replace with shared Redis store before multi-instance deployment.
// Login + registration share the stricter, IP-based password-guessing budget.
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many authentication attempts. Try again later." },
});

// Refreshes are already protected by unguessable rotating tokens and CSRF.
// Give them a separate quota so failed sign-ins cannot exhaust refresh traffic.
// This remains an in-memory, per-instance limiter until a shared store is added.
export const refreshRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many refresh attempts. Try again later." },
});
