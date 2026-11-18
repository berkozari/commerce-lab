import { Router } from "express";
import { getPrisma } from "../config/database.js";
import { logger } from "../lib/logger.js";

export const healthRouter = Router();

// Preserve the EC-001 endpoint contract.
healthRouter.get("/", (_req, res) => {
    res.status(200).json({ success: true, data: { status: "ok", service: "commerce-lab-api" } });
});
healthRouter.get("/live", (_req, res) => {
    res.status(200).json({ success: true, data: { status: "ok" } });
});
healthRouter.get("/ready", async (_req, res) => {
    try {
        await getPrisma().$queryRaw`SELECT 1`;
        res.status(200).json({ success: true, data: { status: "ready", database: "connected" } });
    } catch (error) {
        logger.warn({ err: error }, "Readiness check failed");
        res.status(503).json({ success: false, message: "Service not ready", data: { database: "unavailable" } });
    }
});
