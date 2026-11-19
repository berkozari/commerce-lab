import { apiMutation, apiRequest } from "../../../lib/api-client";

export type CartLine = {
    id: string; variantId: string; quantity: number; sku: string; variantName: string;
    product: { id: string; name: string; slug: string };
    unitPrice: string; lineTotal: string; currency: string;
    available: boolean; unavailableReason: string | null;
};
export type Cart = { id: string; items: CartLine[]; itemCount: number; availableSubtotal: string; currency: string };

export const cartApi = {
    get: () => apiRequest<Cart>("/api/v1/cart"),
    add: (input: { variantId: string; quantity: number }) => apiMutation<Cart>("/api/v1/cart/items", "POST", input),
    quantity: (itemId: string, quantity: number) => apiMutation<Cart>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, "PATCH", { quantity }),
    remove: (itemId: string) => apiMutation<Cart>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, "DELETE"),
    clear: () => apiMutation<Cart>("/api/v1/cart", "DELETE"),
    merge: () => apiMutation<Cart>("/api/v1/cart/merge", "POST"),
};
