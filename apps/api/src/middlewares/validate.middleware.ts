import type { RequestHandler } from "express";
import type { z } from "zod";

/** Validates request body. Zod errors are handled by the central error middleware. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
    return (req, _res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            next(error);
        }
    };
}
