import { ApiError, apiMutation, apiRequest } from "../../../lib/api-client";

export type AuthUser = { id: string; name: string; email: string; role: "CUSTOMER" | "ADMIN" };
export type LoginInput = { email: string; password: string };
export type RegisterInput = { name: string; email: string; password: string };

type UserResponse = { user: AuthUser };

export const authApi = {
    login: async (input: LoginInput) => (await apiMutation<UserResponse>("/api/v1/auth/login", "POST", input)).user,
    register: async (input: RegisterInput) => (await apiMutation<UserResponse>("/api/v1/auth/register", "POST", input)).user,
    logout: () => apiMutation<{ loggedOut: boolean }>("/api/v1/auth/logout", "POST"),
    logoutAll: () => apiMutation<{ loggedOut: boolean }>("/api/v1/auth/logout-all", "POST"),
    me: async () => (await apiRequest<UserResponse>("/api/v1/auth/me")).user,
    refresh: async () => (await apiMutation<UserResponse>("/api/v1/auth/refresh", "POST")).user,
};

/** Refresh access-cookie once on an unauthenticated response. Never retry endlessly. */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        return await authApi.me();
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    try {
        await authApi.refresh();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
    try {
        return await authApi.me();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
}
