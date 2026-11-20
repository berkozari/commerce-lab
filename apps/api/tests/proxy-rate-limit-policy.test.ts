import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { parseTrustedProxyCidrs } from "../src/config/trusted-proxies.js";
import { authRateLimit, refreshRateLimit } from "../src/middlewares/auth-rate-limit.middleware.js";

function createIpProbe(trustedCidrs: string[] = []) {
    const probe = express();
    if (trustedCidrs.length > 0) probe.set("trust proxy", trustedCidrs);
    probe.get("/ip", (req, res) => res.json({ ip: req.ip }));
    return probe;
}

describe("EC-013.5.2: reverse proxy trust boundaries", () => {
    it("does not trust client-supplied X-Forwarded-For by default", async () => {
        const response = await request(createIpProbe())
            .get("/ip")
            .set("X-Forwarded-For", "198.51.100.42");
        expect(response.status).toBe(200);
        expect(response.body.ip).not.toBe("198.51.100.42");
    });

    it("accepts a client address from an explicitly trusted local proxy", async () => {
        const proxy = createIpProbe(parseTrustedProxyCidrs("127.0.0.1/32, ::1/128"));
        const response = await request(proxy)
            .get("/ip")
            .set("X-Forwarded-For", "198.51.100.42");
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe("198.51.100.42");
    });

    it("stops at the nearest untrusted hop rather than a spoofed distant hop", async () => {
        const proxy = createIpProbe(parseTrustedProxyCidrs("127.0.0.1/32,::1/128"));
        const response = await request(proxy)
            .get("/ip")
            .set("X-Forwarded-For", "198.51.100.42, 203.0.113.77");
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe("203.0.113.77");
    });

    it("accepts only explicit IP or CIDR entries, never a wildcard or hop count", () => {
        expect(parseTrustedProxyCidrs(undefined)).toEqual([]);
        expect(parseTrustedProxyCidrs(" ")).toEqual([]);
        expect(parseTrustedProxyCidrs("127.0.0.1/32, ::1/128"))
            .toEqual(["127.0.0.1/32", "::1/128"]);
        for (const value of ["true", "1", "*", "0.0.0.0/0", "::/0", "127.0.0.1/33", "127.0.0.1,", "hello.example"]) {
            expect(() => parseTrustedProxyCidrs(value), value).toThrow();
        }
    });
});

describe("EC-013.5.2: separate login and refresh quotas", () => {
    it("exhausting the login budget does not exhaust refresh; refresh has its own cap", async () => {
        const probe = express();
        probe.post("/sign-in", authRateLimit, (_req, res) => res.status(200).end());
        probe.post("/refresh", refreshRateLimit, (_req, res) => res.status(200).end());

        for (let n = 0; n < 20; n += 1) {
            const response = await request(probe).post("/sign-in");
            expect(response.status, `login attempt ${n + 1}`).toBe(200);
        }
        const blockedLogin = await request(probe).post("/sign-in");
        expect(blockedLogin.status).toBe(429);
        expect(Number(blockedLogin.headers["retry-after"])).toBeGreaterThan(0);

        for (let n = 0; n < 60; n += 1) {
            const response = await request(probe).post("/refresh");
            expect(response.status, `refresh attempt ${n + 1}`).toBe(200);
        }
        const blockedRefresh = await request(probe).post("/refresh");
        expect(blockedRefresh.status).toBe(429);
        expect(blockedRefresh.body.message).toBe("Too many refresh attempts. Try again later.");
        expect(Number(blockedRefresh.headers["retry-after"])).toBeGreaterThan(0);
    });
});
