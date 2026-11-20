// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogApi, type ProductFilters, type ProductList } from "../api/catalog";
import { useProducts } from "./use-catalog";

const filters: ProductFilters = { page: 1, limit: 12, sort: "newest", q: "sneaker" };
const emptyList: ProductList = {
    items: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
};

function setup() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    function wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe("EC-013.8.3 – catalog query cache", () => {
    it("deduplicates simultaneous consumers with equivalent filter objects", async () => {
        const { client, wrapper } = setup();
        let resolveRequest!: (value: ProductList) => void;
        const request = new Promise<ProductList>((resolve) => { resolveRequest = resolve; });
        const productsRequest = vi.spyOn(catalogApi, "products").mockReturnValue(request);

        const first = renderHook(() => useProducts({ ...filters }), { wrapper });
        const second = renderHook(() => useProducts({ ...filters }), { wrapper });
        await waitFor(() => expect(productsRequest).toHaveBeenCalledTimes(1));
        await act(async () => { resolveRequest(emptyList); await request; });
        await waitFor(() => expect(first.result.current.isSuccess && second.result.current.isSuccess).toBe(true));

        first.unmount();
        second.unmount();
        client.clear();
    });

    it("treats a different page as a separate query key", async () => {
        const { client, wrapper } = setup();
        const productsRequest = vi.spyOn(catalogApi, "products")
            .mockResolvedValue(emptyList);

        const first = renderHook(() => useProducts({ ...filters }), { wrapper });
        const second = renderHook(() => useProducts({ ...filters, page: 2 }), { wrapper });
        await waitFor(() => expect(productsRequest).toHaveBeenCalledTimes(2));

        first.unmount();
        second.unmount();
        client.clear();
    });
});
