import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../src/lib/logger.js";
import { requestLogLevel, safeErrorType, safeRouteTemplate } from "../src/lib/observability.js";
import { requestIdMiddleware } from "../src/middlewares/request-id.middleware.js";
import { errorMiddleware } from "../src/middlewares/error.middleware.js";

const SECRET = "never-log-secret-ec01392";

afterEach(() => { vi.restoreAllMocks(); });

describe("EC-013.9.2: operational request logging", () => {
    it("keeps expected successes and ordinary 4xx at info level", () => {
        expect(requestLogLevel(200, 20, 1000)).toBe("info");
        expect(requestLogLevel(401, 20, 1000)).toBe("info");
        expect(requestLogLevel(404, 20, 1000)).toBe("info");
    });

    it("warns for rate limits, server failures and slow requests", () => {
        expect(requestLogLevel(429, 20, 1000)).toBe("warn");
        expect(requestLogLevel(503, 20, 1000)).toBe("warn");
        expect(requestLogLevel(200, 1000, 1000)).toBe("warn");
        expect(requestLogLevel(200, 999, 1000)).toBe("info");
    });

    it("only uses safe route templates and safe error names", () => {
        expect(safeRouteTemplate("/orders/:orderId")).toBe("/orders/:orderId");
        expect(safeRouteTemplate(undefined)).toBe("<unmatched>");
        expect(safeRouteTemplate("private-value")).toBe("<unmatched>");
        expect(safeErrorType(new Error(SECRET))).toBe("Error");
        const malformed = new Error(SECRET);
        malformed.name = SECRET + "!";
        expect(safeErrorType(malformed)).toBe("UnknownError");
        expect(safeErrorType(SECRET)).toBe("UnknownError");
    });

    it("logs a route template and request ID, never a parameter or query string", async () => {
        const info = vi.spyOn(logger, "info").mockImplementation(() => { });
        const app = express();
        app.use(requestIdMiddleware);
        app.get("/orders/:orderId", (_req, res) => res.status(200).json({ success: true }));
        const response = await request(app).get(`/orders/${SECRET}?token=${SECRET}`).set("x-request-id", "test_req_01392");
        expect(response.status).toBe(200);
        expect(response.headers["x-request-id"]).toBe("test_req_01392");
        expect(info).toHaveBeenCalledOnce();
        const fields = info.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(fields).toMatchObject({ requestId: "test_req_01392", method: "GET", route: "/orders/:orderId", statusCode: 200 });
        expect(fields.durationMs).toEqual(expect.any(Number));
        expect(JSON.stringify(info.mock.calls)).not.toContain(SECRET);
    });

    it("logs an HTTP 429 at warning severity", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => { });
        const info = vi.spyOn(logger, "info").mockImplementation(() => { });
        const app = express();
        app.use(requestIdMiddleware);
        app.get("/limited", (_req, res) => res.status(429).json({ success: false }));
        expect((await request(app).get("/limited")).status).toBe(429);
        expect(warn).toHaveBeenCalledOnce();
        expect(info).not.toHaveBeenCalled();
        expect(warn.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ statusCode: 429 }));
    });

    it("logs a 5xx completion warning and a sanitized error event", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => { });
        const error = vi.spyOn(logger, "error").mockImplementation(() => { });
        const app = express();
        app.use(requestIdMiddleware);
        app.get("/broken", () => { throw new Error(`SQL error: ${SECRET}`); });
        app.use(errorMiddleware);
        const response = await request(app).get("/broken").set("x-request-id", "failed_request_01392");
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({ message: "Internal server error", requestId: "failed_request_01392" });
        expect(error).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledOnce();
        expect(error.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ requestId: "failed_request_01392", errorType: "Error", statusCode: 500 }));
        expect(JSON.stringify(error.mock.calls)).not.toContain(SECRET);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    });
});
