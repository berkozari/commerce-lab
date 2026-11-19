import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersApi, type ShippingAddress } from "../api/orders";
import { cartKey } from "../../cart/hooks/use-cart";

export function useOrder(id: string) {
    return useQuery({ queryKey: ["orders", id], queryFn: () => ordersApi.detail(id), enabled: Boolean(id), retry: false });
}
export function useCheckout() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ shippingAddress, key }: { shippingAddress: ShippingAddress; key: string }) => ordersApi.checkout(shippingAddress, key), onSuccess: (result) => {
            client.removeQueries({ queryKey: cartKey });
            client.setQueryData(["orders", result.order.id], result.order);
            void client.invalidateQueries({ queryKey: ["orders"] });
        }
    });
}
export function useDemoPayment(id: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (outcome: "success" | "failure") => ordersApi.pay(id, outcome), onSuccess: (order) => {
            client.setQueryData(["orders", id], order);
            void client.invalidateQueries({ queryKey: ["orders"] });
        }
    });
}
