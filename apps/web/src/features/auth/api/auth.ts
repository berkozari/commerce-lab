import { ApiError, apiMutation, apiRequest } from "../../../lib/api-client";
import { hasCrossTabSessionLock, withAuthSessionLock } from "../lib/session-coordination";

export type AuthUser = { id: string; name: string; email: string; role: "CUSTOMER" | "ADMIN" };
export type LoginInput = { email: string; password: string };
export type RegisterInput = { name: string; email: string; password: string };

type UserResponse = { user: AuthUser };

function isUnauthorized(error: unknown): error is ApiError {
    return error instanceof ApiError && error.status === 401;
}

// Do not call this outside withAuthSessionLock: refresh rotates the HTTP-only cookie.
async function requestRefresh(): Promise<void> {
    await apiMutation<UserResponse>("/api/v1/auth/refresh", "POST");
}

export const authApi = {
    login: (input: LoginInput) => withAuthSessionLock(async () => (await apiMutation<UserResponse>("/api/v1/auth/login", "POST", input)).user),
    register: (input: RegisterInput) => withAuthSessionLock(async () => (await apiMutation<UserResponse>("/api/v1/auth/register", "POST", input)).user),
    logout: () => withAuthSessionLock(() => apiMutation<{ loggedOut: boolean }>("/api/v1/auth/logout", "POST")),
    logoutAll: () => withAuthSessionLock(() => apiMutation<{ loggedOut: boolean }>("/api/v1/auth/logout-all", "POST")),
    me: async () => (await apiRequest<UserResponse>("/api/v1/auth/me")).user,
};

let refreshInFlight: Promise<AuthUser | null> | null = null;

/** One refresh per tab; Web Locks serialize it with other same-origin tabs. */
function recoverSession(): Promise<AuthUser | null> {
    if (refreshInFlight) return refreshInFlight;

    const task = withAuthSessionLock(async (): Promise<AuthUser | null> => {
        if (hasCrossTabSessionLock()) {
            // Another tab might have refreshed while we waited for the lock.
            // In that case the latest access cookie already works: do NOT rotate again.
            try {
                return await authApi.me();
            } catch (error) {
                if (!isUnauthorized(error)) throw error;
            }
        }

        try {
            await requestRefresh();
        } catch (error) {
            if (isUnauthorized(error)) return null;
            throw error;
        }

        try {
            return await authApi.me();
        } catch (error) {
            if (isUnauthorized(error)) return null;
            throw error;
        }
    });

    refreshInFlight = task;
    // A rejection must also release the single-flight slot for future retries.
    void task.then(
        () => { if (refreshInFlight === task) refreshInFlight = null; },
        () => { if (refreshInFlight === task) refreshInFlight = null; },
    );
    return task;
}

/** Try an expired access cookie once. Never retry endlessly or mask API downtime. */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        return await authApi.me();
    } catch (error) {
        if (!isUnauthorized(error)) throw error;
    }
    return recoverSession();
}
