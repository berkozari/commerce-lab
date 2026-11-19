import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cartApi, type Cart } from "../api/cart";
export const cartKey = ["cart", "current"] as const;
export const cartMergeWarningKey = ["cart", "merge-warning"] as const;

export function useCart() {
    return useQuery({ queryKey: cartKey, queryFn: cartApi.get, retry: false, staleTime: 5_000 });
}

export function useCartMutation<T>(mutationFn: (arg: T) => Promise<Cart>) {
    const client = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (cart) => client.setQueryData(cartKey, cart),
    });
}

export function useAddCartItem() { return useCartMutation(cartApi.add); }
export function useSetCartQuantity() { return useCartMutation(({ itemId, quantity }: { itemId: string; quantity: number }) => cartApi.quantity(itemId, quantity)); }
export function useRemoveCartItem() { return useCartMutation(cartApi.remove); }
export function useClearCart() { return useCartMutation(cartApi.clear); }
export function useMergeCart() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: cartApi.merge, onSuccess: (cart) => {
            client.setQueryData(cartKey, cart);
            client.setQueryData(cartMergeWarningKey, false);
        }
    });
}
