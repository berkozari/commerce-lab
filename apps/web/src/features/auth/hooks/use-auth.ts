import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, getCurrentUser, type AuthUser } from "../api/auth";
import { cartApi } from "../../cart/api/cart";
import { cartKey, cartMergeWarningKey } from "../../cart/hooks/use-cart";
import { announceAuthSessionChange } from "../lib/session-coordination";

export const authQueryKey = ["auth", "current-user"] as const;
export function useCurrentUser() {
    return useQuery({ queryKey: authQueryKey, queryFn: getCurrentUser, retry: false, staleTime: 10_000, refetchOnWindowFocus: true });
}

export function useLogin() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.login,
        onSuccess: async (user) => {
            // A successful sign-in can replace a different account in the same tab.
            // Drop ALL previously cached data (orders, cart, account, future private
            // queries) before exposing the new user to avoid cross-account leaks.
            await client.cancelQueries();
            client.clear();
            client.setQueryData<AuthUser>(authQueryKey, user);
            try {
                const cart = await cartApi.merge();
                client.setQueryData(cartKey, cart);
                client.setQueryData(cartMergeWarningKey, false);
            } catch {
                // Authentication succeeded; keep guest cookie so merge can be retried from Cart.
                client.setQueryData(cartMergeWarningKey, true);
                await client.invalidateQueries({ queryKey: cartKey });
            } finally {
                announceAuthSessionChange();
            }
        },
    });
}
export function useRegister() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.register,
        onSuccess: async (user) => {
            // A successful sign-in can replace a different account in the same tab.
            // Drop ALL previously cached data (orders, cart, account, future private
            // queries) before exposing the new user to avoid cross-account leaks.
            await client.cancelQueries();
            client.clear();
            client.setQueryData<AuthUser>(authQueryKey, user);
            try {
                const cart = await cartApi.merge();
                client.setQueryData(cartKey, cart);
                client.setQueryData(cartMergeWarningKey, false);
            } catch {
                // Authentication succeeded; keep guest cookie so merge can be retried from Cart.
                client.setQueryData(cartMergeWarningKey, true);
                await client.invalidateQueries({ queryKey: cartKey });
            } finally {
                announceAuthSessionChange();
            }
        },
    });
}
export function useLogout() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.logout,
        onSuccess: async () => {
            await client.cancelQueries();
            client.clear();
            client.setQueryData(authQueryKey, null);
            announceAuthSessionChange();
        },
    });
}
export function useLogoutAll() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.logoutAll,
        onSuccess: async () => {
            await client.cancelQueries();
            client.clear();
            client.setQueryData(authQueryKey, null);
            announceAuthSessionChange();
        },
    });
}
