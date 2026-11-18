import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (_req, res) => {
    res.status(404).json({ success: false, message: "Route not found", requestId: res.locals.requestId });
};
