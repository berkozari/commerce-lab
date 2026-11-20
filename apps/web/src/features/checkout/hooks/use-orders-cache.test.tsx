// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ordersApi, type Order, type ShippingAddress } from "../api/orders";
import { cartKey } from "../../cart/hooks/use-cart";
import { orderListKey, useCheckout, useDemoPayment, useOrder } from "./use-orders";

const address: ShippingAddress = {
    recipientName: "Demo Customer", phone: "5551112233", country: "TR",
    city: "Istanbul", district: "Kadikoy", addressLine: "Demo address",
};
const pendingOrder: Order = {
    id: "order-demo-1", orderNumber: "CL-TEST-1", status: "PENDING",
    paymentStatus: "PENDING", currency: "TRY", subtotal: "100", shippingAmount: "0",
    total: "100", shippingAddress: address, items: [],
    createdAt: "2026-11-19T10:00:00.000Z", updatedAt: "2026-11-19T10:00:00.000Z",
};
const paidOrder: Order = { ...pendingOrder, status: "CONFIRMED", paymentStatus: "PAID" };

function setup() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    function wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={ client }> { children } </QueryClientProvider>;
    }
    return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe("EC-013.8.3 – order query cache efficiency", () => {
    it("does not refetch an active order detail after a successful demo payment", async () => {
        const { client, wrapper } = setup();
        client.setQueryData(["orders", pendingOrder.id], pendingOrder);
        client.setQueryData(orderListKey(1), { items: [pendingOrder], total: 1, page: 1, limit: 10 });
        client.setQueryData(orderListKey(2), { items: [], total: 1, page: 2, limit: 10 });

        const detailRequest = vi.spyOn(ordersApi, "detail").mockResolvedValue(paidOrder);
        const paymentRequest = vi.spyOn(ordersApi, "pay").mockResolvedValue(paidOrder);
        const { result, unmount } = renderHook(
            () => ({ order: useOrder(pendingOrder.id), pay: useDemoPayment(pendingOrder.id) }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.order.isSuccess).toBe(true));

        await act(async () => {
            await result.current.pay.mutateAsync("success");
        });

        expect(paymentRequest).toHaveBeenCalledOnce();
        expect(detailRequest).not.toHaveBeenCalled();
        expect(client.getQueryData(["orders", pendingOrder.id])).toEqual(paidOrder);
        expect(client.getQueryState(["orders", pendingOrder.id])?.isInvalidated).toBe(false);
        expect(client.getQueryState(orderListKey(1))?.isInvalidated).toBe(true);
        expect(client.getQueryState(orderListKey(2))?.isInvalidated).toBe(true);
        unmount();
        client.clear();
    });

    it("seeds the new order detail and invalidates paginated lists after checkout", async () => {
        const { client, wrapper } = setup();
        const checkoutRequest = vi.spyOn(ordersApi, "checkout")
            .mockResolvedValue({ order: pendingOrder, replayed: false });
        client.setQueryData(cartKey, { items: [], itemCount: 0 });
        client.setQueryData(orderListKey(1), { items: [], total: 0, page: 1, limit: 10 });
        const { result, unmount } = renderHook(() => useCheckout(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({ shippingAddress: address, key: "test-idempotency-key" });
        });

        expect(checkoutRequest).toHaveBeenCalledWith(address, "test-idempotency-key");
        expect(client.getQueryData(["orders", pendingOrder.id])).toEqual(pendingOrder);
        expect(client.getQueryData(cartKey)).toBeUndefined();
        expect(client.getQueryState(orderListKey(1))?.isInvalidated).toBe(true);
        unmount();
        client.clear();
    });
});
