import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";

describe("Health API", () => {
    it("GET /api/v1/health returns a healthy status", async () => {
        const response = await request(app)
            .get("/api/v1/health");

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            success: true,
            data: {
                status: "ok",
                service: "commerce-lab-api",
            },
        });
    });
});