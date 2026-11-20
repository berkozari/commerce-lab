import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";
import { logger } from "../lib/logger.js";
import { safeErrorType } from "../lib/observability.js";

export const errorMiddleware: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next;

    const requestId = res.locals.requestId as string | undefined;
    if (error instanceof ZodError) {
        res.status(400).json({
            success: false, message: "Validation failed", requestId,
            errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        });
        return;
    }
    if (error instanceof AppError) {
        // A programmer may accidentally construct AppError with a sensitive
        // internal message and a 5xx status. Never send that message to clients.
        if (error.statusCode >= 500) {
            logger.error({ requestId, errorType: safeErrorType(error), statusCode: error.statusCode }, "HTTP application error");
            res.status(error.statusCode).json({ success: false, message: "Internal server error", requestId });
            return;
        }
        res.status(error.statusCode).json({ success: false, message: error.message, requestId });
        return;
    }
    logger.error({ requestId, errorType: safeErrorType(error), statusCode: 500 }, "Unhandled HTTP error");
    res.status(500).json({ success: false, message: "Internal server error", requestId });
};
