import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger.js";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
    const incoming = req.get("x-request-id");
    const requestId = incoming && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const started = performance.now();
    res.on("finish", () => {
        logger.info({ requestId, method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Math.round(performance.now() - started) }, "HTTP request completed");
    });
    next();
};
