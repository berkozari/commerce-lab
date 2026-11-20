import type { RequestHandler } from "express";

// Account, checkout and administration responses must not be retained by
// browsers or shared caches, including rejected requests.
export const privateNoStore: RequestHandler = (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
};
