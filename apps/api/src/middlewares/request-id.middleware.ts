import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { requestLogLevel, safeRouteTemplate } from "../lib/observability.js";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
    const incoming = req.get("x-request-id");
    const requestId = incoming && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const started = performance.now();

    res.once("finish", () => {
        const durationMs = Math.round(performance.now() - started);
        const fields = {
            requestId,
            method: req.method,
            route: safeRouteTemplate(req.route?.path),
            statusCode: res.statusCode,
            durationMs,
        };
        const level = requestLogLevel(res.statusCode, durationMs, env.SLOW_REQUEST_MS);
        logger[level](fields, "HTTP request completed");
    });
    next();
};
