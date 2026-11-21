// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi, type AuthUser } from "../../../../src/features/auth/api/auth";
import { cartApi, type Cart } from "../../../../src/features/cart/api/cart";
import { cartKey } from "../../../../src/features/cart/hooks/use-cart";
import { authQueryKey, useLogin, useRegister } from "../../../../src/features/auth/hooks/use-auth";

const oldUser: AuthUser = { id: "user-a", email: "a@example.test", name: "User A", role: "CUSTOMER" };
const newUser: AuthUser = { id: "user-b", email: "b@example.test", name: "User B", role: "CUSTOMER" };
const newCart: Cart = { id: "cart-b", items: [], itemCount: 0, availableSubtotal: "0.00", currency: "TRY" };

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    // Mimic data already cached for A before sign-in to B in the same tab.
    client.setQueryData(authQueryKey, oldUser);
    client.setQueryData(["orders", "list", 1], { items: [{ id: "order-a", shippingAddress: { city: "Private A" } }] });
    client.setQueryData(["orders", "order-a"], { id: "order-a", shippingAddress: { city: "Private A" } });
    client.setQueryData(cartKey, { id: "cart-a", items: [{ id: "private-a" }] });
    client.setQueryData(["future", "private", "data"], { accountId: "user-a" });
    function wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={ client }> { children } </QueryClientProvider>;
    }
    return { client, wrapper };
}

function expectIsolated(client: QueryClient) {
    expect(client.getQueryData(authQueryKey)).toEqual(newUser);
    expect(client.getQueryData(cartKey)).toEqual(newCart);
    expect(client.getQueryData(["orders", "list", 1])).toBeUndefined();
    expect(client.getQueryData(["orders", "order-a"])).toBeUndefined();
    expect(client.getQueryData(["future", "private", "data"])).toBeUndefined();
}

afterEach(() => vi.restoreAllMocks());

describe("EC-013.10.3.1: same-tab account isolation", () => {
    it("discards account A's cached data when signing in as account B", async () => {
        vi.spyOn(authApi, "login").mockResolvedValue(newUser);
        vi.spyOn(cartApi, "merge").mockResolvedValue(newCart);
        const { client, wrapper } = setup();
        const { result, unmount } = renderHook(() => useLogin(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync({ email: newUser.email, password: "demo-password" });
        });
        expectIsolated(client);
        unmount();
        client.clear();
    });

    it("discards account A's cached data when registering account B", async () => {
        vi.spyOn(authApi, "register").mockResolvedValue(newUser);
        vi.spyOn(cartApi, "merge").mockResolvedValue(newCart);
        const { client, wrapper } = setup();
        const { result, unmount } = renderHook(() => useRegister(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync({ name: newUser.name, email: newUser.email, password: "demo-password" });
        });
        expectIsolated(client);
        unmount();
        client.clear();
    });
});
