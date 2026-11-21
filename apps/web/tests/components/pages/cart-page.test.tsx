// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "../../../src/pages/cart-page";
import { cartMergeWarningKey } from "../../../src/features/cart/hooks/use-cart";
import type { Cart } from "../../../src/features/cart/api/cart";
import { ApiError } from "../../../src/lib/api-client";

const mocks = vi.hoisted(() => ({
    cart: vi.fn(), currentUser: vi.fn(), quantity: vi.fn(), remove: vi.fn(), clear: vi.fn(), merge: vi.fn(),
    refetch: vi.fn(), quantityAsync: vi.fn(), removeAsync: vi.fn(), clearAsync: vi.fn(), mergeAsync: vi.fn(),
}));
vi.mock("../../../src/features/cart/hooks/use-cart", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../src/features/cart/hooks/use-cart")>(),
    useCart: mocks.cart,
    useSetCartQuantity: mocks.quantity,
    useRemoveCartItem: mocks.remove,
    useClearCart: mocks.clear,
    useMergeCart: mocks.merge,
}));
vi.mock("../../../src/features/auth/hooks/use-auth", () => ({ useCurrentUser: mocks.currentUser }));

const item: Cart["items"][number] = {
    id: "line-1", variantId: "variant-1", quantity: 1, sku: "BAG-001", variantName: "Standard",
    product: { id: "product-1", name: "Linen Backpack", slug: "linen-backpack" },
    unitPrice: "120.00", lineTotal: "120.00", currency: "TRY", available: true, unavailableReason: null,
};
const fullCart: Cart = { id: "cart-1", items: [item], itemCount: 1, availableSubtotal: "120.00", currency: "TRY" };
const emptyCart: Cart = { id: "cart-1", items: [], itemCount: 0, availableSubtotal: "0.00", currency: "TRY" };

function RouteInfo() {
    const location = useLocation();
    return <output data-testid="destination">{JSON.stringify({ path: location.pathname, state: location.state })}</output>;
}
function view(warning = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (warning) client.setQueryData(cartMergeWarningKey, true);
    return render(<QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cart"]}>
            <Routes>
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<RouteInfo />} />
                <Route path="/login" element={<RouteInfo />} />
            </Routes>
        </MemoryRouter>
    </QueryClientProvider>);
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.cart.mockReturnValue({ data: fullCart, isPending: false, isError: false, error: null, refetch: mocks.refetch });
    mocks.currentUser.mockReturnValue({ data: null });
    for (const [hook, fn] of [[mocks.quantity, mocks.quantityAsync], [mocks.remove, mocks.removeAsync], [mocks.clear, mocks.clearAsync], [mocks.merge, mocks.mergeAsync]]) {
        fn.mockResolvedValue(fullCart);
        hook.mockReturnValue({ isPending: false, isError: false, error: null, mutateAsync: fn });
    }
});
afterEach(cleanup);

describe("CartPage", () => {
    it("shows loading while the cart query is pending", () => {
        mocks.cart.mockReturnValue({ isPending: true, isError: false });
        view();
        expect(screen.getByRole("status").textContent).toContain("Loading your cart");
    });
    it("shows a recoverable loading error", () => {
        mocks.cart.mockReturnValue({ isPending: false, isError: true, error: new ApiError(503, "Temporary outage"), refetch: mocks.refetch });
        view();
        expect(screen.getByRole("alert").textContent).toContain("Temporary outage");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });
    it("renders an empty-cart state and browse link", () => {
        mocks.cart.mockReturnValue({ data: emptyCart, isPending: false, isError: false });
        view();
        expect(screen.getByText("Your cart is empty")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Explore products" }).getAttribute("href")).toBe("/products");
    });
    it("preserves checkout as the login return destination for guests", () => {
        view();
        fireEvent.click(screen.getByRole("button", { name: "Sign in to checkout" }));
        expect(JSON.parse(screen.getByTestId("destination").textContent ?? "{}")).toEqual({ path: "/login", state: { from: "/checkout" } });
    });
    it("takes an authenticated customer directly to checkout", () => {
        mocks.currentUser.mockReturnValue({ data: { id: "u-1", role: "CUSTOMER" } });
        view();
        fireEvent.click(screen.getByRole("button", { name: "Proceed to checkout" }));
        expect(JSON.parse(screen.getByTestId("destination").textContent ?? "{}").path).toBe("/checkout");
    });
    it("prevents checkout when any line is unavailable", () => {
        mocks.cart.mockReturnValue({ data: { ...fullCart, items: [{ ...item, available: false, unavailableReason: "Out of stock" }] }, isPending: false, isError: false });
        view();
        expect(screen.getByRole("status").textContent).toContain("Out of stock");
        expect((screen.getByRole("button", { name: "Sign in to checkout" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("sends quantity changes, removes items, and clears the cart", async () => {
        view();
        fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
        fireEvent.click(screen.getByRole("button", { name: "Remove" }));
        fireEvent.click(screen.getByRole("button", { name: "Clear cart" }));
        await waitFor(() => {
            expect(mocks.quantityAsync).toHaveBeenCalledWith({ itemId: "line-1", quantity: 2 });
            expect(mocks.removeAsync).toHaveBeenCalledWith("line-1");
            expect(mocks.clearAsync).toHaveBeenCalledTimes(1);
        });
    });
    it("allows an authenticated customer to retry a failed guest-cart merge", async () => {
        mocks.currentUser.mockReturnValue({ data: { id: "u-1", role: "CUSTOMER" } });
        view(true);
        expect(screen.getByRole("alert").textContent).toContain("couldn't merge");
        fireEvent.click(screen.getByRole("button", { name: "Retry merge" }));
        await waitFor(() => expect(mocks.mergeAsync).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
});
