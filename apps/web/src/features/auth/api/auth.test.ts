import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api-client";
import { authApi, getCurrentUser } from "./auth";

afterEach(() => vi.unstubAllGlobals());

describe("auth API", () => {
    it("loads the active user with cookies", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { user: { id: "u1", name: "Demo", email: "a@example.com", role: "CUSTOMER" } } }) });
        vi.stubGlobal("fetch", fetchMock);
        expect((await authApi.me()).id).toBe("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.objectContaining({ credentials: "include" }));
    });
    it("returns null when there is no session to refresh", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, message: "Unauthorized" }) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { csrfToken: "csrf" } }) })
            .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, message: "Unauthorized" }) });
        vi.stubGlobal("fetch", fetchMock);
        await expect(getCurrentUser()).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    it("does not mask API downtime", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false, message: "Unavailable" }) }));
        await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiError);
    });
});
