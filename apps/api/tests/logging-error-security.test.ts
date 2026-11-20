import { Writable } from "node:stream";
import express from "express";
import pino from "pino";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { logger, loggerOptions } from "../src/lib/logger.js";
import { errorMiddleware } from "../src/middlewares/error.middleware.js";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware.js";
import { requestIdMiddleware } from "../src/middlewares/request-id.middleware.js";
import { validateBody } from "../src/middlewares/validate.middleware.js";
import { AppError } from "../src/utils/app-error.js";

const SECRET = "never-emit-this-secret-value-0139";

afterEach(() => {
    vi.restoreAllMocks();
});

function createTestApp() {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.get("/handled-404", (_req, _res, next) => next(new AppError("Missing resource", 404)));
    app.get("/handled-503", (_req, _res, next) => next(new AppError(`Internal database detail: ${SECRET}`, 503)));
    app.get("/unexpected", () => { throw new Error(`Unexpected exception: ${SECRET}`); });
    app.post("/validated", validateBody(z.object({ name: z.string().min(3) })), (_req, res) => res.json({ success: true }));
    app.use(notFoundMiddleware);
    app.use(errorMiddleware);
    return app;
}

describe("EC-013.9.1: error response and request correlation", () => {
    it("responds with a generic 5xx message even for AppError", async () => {
        const log = vi.spyOn(logger, "error").mockImplementation(() => { });
        const response = await request(createTestApp()).get("/handled-503").set("x-request-id", "valid_request_503");
        expect(response.status).toBe(503);
        expect(response.headers["x-request-id"]).toBe("valid_request_503");
        expect(response.body).toEqual({ success: false, message: "Internal server error", requestId: "valid_request_503" });
        expect(JSON.stringify(response.body)).not.toContain(SECRET);
        expect(log).toHaveBeenCalledOnce();
        expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    });

    it("does not leak thrown error details to the HTTP client", async () => {
        vi.spyOn(logger, "error").mockImplementation(() => { });
        const response = await request(createTestApp()).get("/unexpected");
        expect(response.status).toBe(500);
        expect(response.body.message).toBe("Internal server error");
        expect(JSON.stringify(response.body)).not.toContain(SECRET);
        expect(response.body.requestId).toMatch(/^[a-f\d-]{36}$/i);
        expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    });

    it("preserves useful client-facing 4xx messages and correlation", async () => {
        const response = await request(createTestApp()).get("/handled-404").set("x-request-id", "valid_404");
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Missing resource", requestId: "valid_404" });
    });

    it("normalizes malformed request IDs before logging or responding", async () => {
        const response = await request(createTestApp()).get("/unknown-path").set("x-request-id", "invalid id with whitespace");
        expect(response.status).toBe(404);
        expect(response.headers["x-request-id"]).toMatch(/^[a-f\d-]{36}$/i);
        expect(response.body.requestId).toBe(response.headers["x-request-id"]);
    });

    it("returns field-level validation errors without exposing a stack trace", async () => {
        const response = await request(createTestApp()).post("/validated").send({ name: "x" });
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Validation failed");
        expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "name" })]));
        expect(response.body).not.toHaveProperty("stack");
    });
});

describe("EC-013.9.1: structured log secret redaction", () => {
    it("redacts sensitive root, nested, body and header fields", () => {
        const chunks: string[] = [];
        const sink = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(chunk.toString());
                callback();
            },
        });
        const testLogger = pino({ ...loggerOptions, level: "info" }, sink);
        testLogger.info({
            password: SECRET,
            session: { refreshToken: SECRET },
            user: { passwordHash: SECRET },
            req: {
                headers: { authorization: SECRET, cookie: SECRET, "set-cookie": SECRET },
                body: { csrfToken: SECRET, password: SECRET },
            },
            res: { headers: { "set-cookie": SECRET } },
            requestId: "safe-test-request",
        }, "Redaction test");
        const record = JSON.parse(chunks.join("")) as Record<string, unknown>;
        expect(chunks.join("")).not.toContain(SECRET);
        expect(record.password).toBe("[REDACTED]");
        expect((record.session as { refreshToken: string }).refreshToken).toBe("[REDACTED]");
        expect(((record.req as { body: { csrfToken: string } }).body).csrfToken).toBe("[REDACTED]");
        expect(record.requestId).toBe("safe-test-request");
    });
});
