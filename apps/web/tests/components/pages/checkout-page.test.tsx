// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "../../../src/pages/checkout-page";
import type { Cart } from "../../../src/features/cart/api/cart";
import { ApiError } from "../../../src/lib/api-client";

const mocks = vi.hoisted(() => ({ cart: vi.fn(), checkout: vi.fn(), checkoutAsync: vi.fn(), randomUUID: vi.fn() }));
vi.mock("../../../src/features/cart/hooks/use-cart", () => ({ useCart: mocks.cart }));
vi.mock("../../../src/features/checkout/hooks/use-orders", () => ({ useCheckout: mocks.checkout }));

const item: Cart["items"][number] = {
    id: "line-1", variantId: "variant-1", quantity: 1, sku: "BAG-001", variantName: "Standard",
    product: { id: "product-1", name: "Linen Backpack", slug: "linen-backpack" },
    unitPrice: "120.00", lineTotal: "120.00", currency: "TRY", available: true, unavailableReason: null,
};
const fullCart: Cart = { id: "cart-1", items: [item], itemCount: 1, availableSubtotal: "120.00", currency: "TRY" };
const emptyCart: Cart = { id: "cart-1", items: [], itemCount: 0, availableSubtotal: "0.00", currency: "TRY" };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.cart.mockReturnValue({ data: fullCart, isPending: false, isError: false, error: null });
    mocks.checkoutAsync.mockResolvedValue({ order: { id: "order-1" } });
    mocks.checkout.mockReturnValue({ mutateAsync: mocks.checkoutAsync, isPending: false, isError: false, error: null });
    mocks.randomUUID.mockReturnValue("idem-key-1");
    vi.stubGlobal("crypto", { randomUUID: mocks.randomUUID });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function view() {
    return render(<MemoryRouter initialEntries={["/checkout"]}>
        <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<h1>Order destination</h1>} />
        </Routes>
    </MemoryRouter>);
}
function fillShipping(city = "Istanbul") {
    const values = [
        ["Recipient name", "Demo Customer"], ["Phone", "5554443333"],
        ["City", city], ["District", "Kadikoy"],
        ["Address line", "Demo street number 42"], ["Postal code (optional)", "34000"],
    ];
    for (const [label, value] of values) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Place demo order" })); }

describe("CheckoutPage", () => {
    it("shows a loading state while the cart request is pending", () => {
        mocks.cart.mockReturnValue({ isPending: true, isError: false });
        view();
        expect(screen.getByRole("status").textContent).toContain("Loading checkout");
    });
    it("offers a route back to the cart when loading fails", () => {
        mocks.cart.mockReturnValue({ isPending: false, isError: true, error: new ApiError(503, "Outage") });
        view();
        expect(screen.getByRole("alert").textContent).toContain("Could not load your cart");
        expect(screen.getByRole("link", { name: "Return to cart" }).getAttribute("href")).toBe("/cart");
    });
    it("does not present checkout when the cart is empty", () => {
        mocks.cart.mockReturnValue({ data: emptyCart, isPending: false, isError: false });
        view();
        expect(screen.getByRole("heading", { name: "Your cart is empty" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Place demo order" })).toBeNull();
    });
    it("blocks unavailable items before rendering the shipping form", () => {
        mocks.cart.mockReturnValue({ data: { ...fullCart, items: [{ ...item, available: false }] }, isPending: false, isError: false });
        view();
        expect(screen.getByRole("alert").textContent).toContain("no longer available");
        expect(screen.queryByRole("button", { name: "Place demo order" })).toBeNull();
    });
    it("prevents submission of an invalid shipping form", async () => {
        view();
        submit();
        await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
        expect(mocks.checkoutAsync).not.toHaveBeenCalled();
    });
    it("submits validated shipping data with an idempotency key and navigates", async () => {
        view();
        fillShipping();
        submit();
        await waitFor(() => expect(mocks.checkoutAsync).toHaveBeenCalledTimes(1));
        expect(mocks.checkoutAsync).toHaveBeenCalledWith({
            key: "idem-key-1",
            shippingAddress: {
                recipientName: "Demo Customer", phone: "5554443333", country: "TR", city: "Istanbul",
                district: "Kadikoy", addressLine: "Demo street number 42", postalCode: "34000",
            },
        });
        expect(await screen.findByRole("heading", { name: "Order destination" })).toBeTruthy();
    });
    it("reuses the same idempotency key when identical data is retried", async () => {
        mocks.checkoutAsync.mockRejectedValueOnce(new Error("Retry later")).mockResolvedValueOnce({ order: { id: "order-1" } });
        view();
        fillShipping();
        submit();
        await waitFor(() => expect(mocks.checkoutAsync).toHaveBeenCalledTimes(1));
        submit();
        await waitFor(() => expect(mocks.checkoutAsync).toHaveBeenCalledTimes(2));
        expect(mocks.checkoutAsync.mock.calls[0]?.[0].key).toBe("idem-key-1");
        expect(mocks.checkoutAsync.mock.calls[1]?.[0].key).toBe("idem-key-1");
        expect(mocks.randomUUID).toHaveBeenCalledTimes(1);
    });
    it("creates a new idempotency key when shipping data changes", async () => {
        mocks.randomUUID.mockReturnValueOnce("idem-key-1").mockReturnValueOnce("idem-key-2");
        mocks.checkoutAsync.mockRejectedValueOnce(new Error("Retry later")).mockResolvedValueOnce({ order: { id: "order-1" } });
        view();
        fillShipping();
        submit();
        await waitFor(() => expect(mocks.checkoutAsync).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Ankara" } });
        submit();
        await waitFor(() => expect(mocks.checkoutAsync).toHaveBeenCalledTimes(2));
        expect(mocks.checkoutAsync.mock.calls[0]?.[0].key).toBe("idem-key-1");
        expect(mocks.checkoutAsync.mock.calls[1]?.[0].key).toBe("idem-key-2");
    });
    it("disables the submit action while an order is being created", () => {
        mocks.checkout.mockReturnValue({ mutateAsync: mocks.checkoutAsync, isPending: true, isError: false });
        view();
        expect((screen.getByRole("button", { name: "Creating order…" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
