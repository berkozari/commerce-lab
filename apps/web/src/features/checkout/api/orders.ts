import { apiRequest, getCsrfToken } from "../../../lib/api-client";

export type ShippingAddress = {
    recipientName: string; phone: string; country: "TR"; city: string;
    district: string; addressLine: string; postalCode?: string;
};
export type OrderItem = {
    id: string; variantId: string | null; productName: string; sku: string;
    quantity: number; unitPrice: string; totalPrice: string;
};
export type Order = {
    id: string; orderNumber: string; status: string; paymentStatus: string;
    currency: string; subtotal: string; shippingAmount: string; total: string;
    shippingAddress: ShippingAddress; items: OrderItem[];
    createdAt: string; updatedAt: string;
};
export type CheckoutResult = { order: Order; replayed: boolean };
export type OrderListResult = { items: Order[]; total: number; page: number; limit: number };

export const ordersApi = {
    list: (page: number, limit = 10) =>
        apiRequest<OrderListResult>(`/api/v1/orders?page=${page}&limit=${limit}`),
    checkout: async (shippingAddress: ShippingAddress, key: string) => {
        const csrf = await getCsrfToken();
        return apiRequest<CheckoutResult>("/api/v1/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrf, "Idempotency-Key": key },
            body: JSON.stringify({ shippingAddress }),
        });
    },
    detail: (id: string) => apiRequest<Order>(`/api/v1/orders/${encodeURIComponent(id)}`),
    pay: async (id: string, outcome: "success" | "failure") => {
        const csrf = await getCsrfToken();
        return apiRequest<Order>(`/api/v1/orders/${encodeURIComponent(id)}/demo-payment`, {
            method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({ outcome }),
        });
    },
};
