import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { authRateLimit } from "../../src/middlewares/auth-rate-limit.middleware.js";

// The standalone Express app only exercises the existing exported limiter.
// It does not contact a database or consume limits on the actual CommerceLab router.
function createLimiterProbe() {
    const probe = express();
    probe.disable("x-powered-by");
    probe.post("/probe-auth", authRateLimit, (_req, res) => {
        res.status(200).json({ success: true });
    });
    return probe;
}

describe("EC-013.5.1: single-process authentication rate limiter", () => {
    it("allows 20 attempts, blocks the next, and communicates retry timing", async () => {
        const probe = createLimiterProbe();

        for (let attempt = 1; attempt <= 20; attempt++) {
            const response = await request(probe).post("/probe-auth");
            expect(response.status, `attempt ${attempt}`).toBe(200);
            expect(response.headers["ratelimit-policy"]).toBeDefined();
            expect(response.headers["ratelimit"]).toBeDefined();
            expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
        }

        const blocked = await request(probe).post("/probe-auth");
        expect(blocked.status).toBe(429);
        expect(blocked.body).toEqual({
            success: false,
            message: "Too many authentication attempts. Try again later.",
        });
        expect(blocked.headers["retry-after"]).toBeDefined();
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
        expect(blocked.headers["ratelimit-policy"]).toBeDefined();
    });
});
