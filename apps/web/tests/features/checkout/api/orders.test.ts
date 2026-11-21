import { afterEach, describe, expect, it, vi } from "vitest";
import { ordersApi } from "../../../../src/features/checkout/api/orders";

afterEach(() => vi.unstubAllGlobals());

describe("order history API", () => {
    it("requests a paginated list with session cookies", async () => {
        const result = { items: [], total: 0, page: 2, limit: 10 };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ success: true, data: result }),
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(ordersApi.list(2)).resolves.toEqual(result);
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/orders?page=2&limit=10", expect.objectContaining({ credentials: "include" }));
    });
    it("uses the owned order detail endpoint", async () => {
        const order = { id: "order-id", orderNumber: "CL-TEST" };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: order }) });
        vi.stubGlobal("fetch", fetchMock);
        await expect(ordersApi.detail("order-id")).resolves.toEqual(order);
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/orders/order-id", expect.objectContaining({ credentials: "include" }));
    });
});
