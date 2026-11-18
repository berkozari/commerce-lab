import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, getCsrfToken } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
    it("unwraps the API envelope and includes cookies", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { status: "ok" } }) });
        vi.stubGlobal("fetch", fetchMock);
        await expect(apiRequest("/api/v1/health")).resolves.toEqual({ status: "ok" });
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.objectContaining({ credentials: "include" }));
    });

    it("exposes HTTP errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, error: { message: "Unauthenticated" } }) }));
        await expect(apiRequest("/api/v1/auth/me")).rejects.toEqual(new ApiError(401, "Unauthenticated"));
    });

    it("reads the CSRF token from the backend contract", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { csrfToken: "sample" } }) }));
        await expect(getCsrfToken()).resolves.toBe("sample");
    });
});
