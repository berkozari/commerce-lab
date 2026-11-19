import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, getCurrentUser, type AuthUser } from "../api/auth";

export const authQueryKey = ["auth", "current-user"] as const;
export function useCurrentUser() {
    return useQuery({ queryKey: authQueryKey, queryFn: getCurrentUser, retry: false, staleTime: 10_000, refetchOnWindowFocus: true });
}

export function useLogin() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.login,
        onSuccess: (user) => client.setQueryData<AuthUser>(authQueryKey, user),
    });
}
export function useRegister() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.register,
        onSuccess: (user) => client.setQueryData<AuthUser>(authQueryKey, user),
    });
}
export function useLogout() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.logout,
        onSuccess: () => { client.clear(); client.setQueryData(authQueryKey, null); },
    });
}
export function useLogoutAll() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: authApi.logoutAll,
        onSuccess: () => { client.clear(); client.setQueryData(authQueryKey, null); },
    });
}
