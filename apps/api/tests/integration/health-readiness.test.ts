import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getPrisma } from "../../src/config/database.js";
import { app } from "../../src/app.js";

vi.mock("../../src/config/database.js", () => ({
    getPrisma: vi.fn(),
}));

describe("Health liveness and database readiness", () => {
    beforeEach(() => {
        vi.mocked(getPrisma).mockReset();
    });

    it("reports ready only when the database responds", async () => {
        const queryRaw = vi.fn().mockResolvedValue([{ one: 1 }]);
        vi.mocked(getPrisma).mockReturnValue({ $queryRaw: queryRaw } as unknown as ReturnType<typeof getPrisma>);

        const response = await request(app).get("/api/v1/health/ready");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            data: { status: "ready", database: "connected" },
        });
        expect(queryRaw).toHaveBeenCalledOnce();
    });

    it("returns HTTP 503 and no error details if the database is unavailable", async () => {
        const queryRaw = vi.fn().mockRejectedValue(new Error("private connection detail"));
        vi.mocked(getPrisma).mockReturnValue({ $queryRaw: queryRaw } as unknown as ReturnType<typeof getPrisma>);

        const response = await request(app).get("/api/v1/health/ready");

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            success: false,
            message: "Service not ready",
            data: { database: "unavailable" },
        });
        expect(JSON.stringify(response.body)).not.toContain("private connection detail");
    });

    it("keeps liveness independent of database availability", async () => {
        vi.mocked(getPrisma).mockImplementation(() => {
            throw new Error("database unavailable");
        });

        const response = await request(app).get("/api/v1/health/live");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { status: "ok" } });
        expect(getPrisma).not.toHaveBeenCalled();
    });
});
