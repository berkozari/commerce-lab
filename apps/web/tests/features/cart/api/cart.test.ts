import { afterEach, describe, expect, it, vi } from "vitest";
import { cartApi } from "../../../../src/features/cart/api/cart";

afterEach(() => vi.unstubAllGlobals());

describe("cart API", () => {
    it("includes credentials and obtains CSRF token before adding an item", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { csrfToken: "test-csrf" } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: "cart", items: [], itemCount: 0, availableSubtotal: "0.00", currency: "TRY" } }) });
        vi.stubGlobal("fetch", fetchMock);
        await cartApi.add({ variantId: "variant", quantity: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe("/api/v1/cart/items");
        expect(init.credentials).toBe("include");
        expect(init.headers["x-csrf-token"]).toBe("test-csrf");
    });
});
