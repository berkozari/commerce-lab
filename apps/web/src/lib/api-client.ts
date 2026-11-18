export class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "ApiError";
    }
}

type Envelope<T> = { success: true; data: T } | { success: false; error?: { message?: string } | string; message?: string };

function errorMessage(data: unknown): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    const item = data as { error?: { message?: string } | string; message?: string };
    if (typeof item.error === "string") return item.error;
    if (typeof item.error === "object" && typeof item.error?.message === "string") return item.error.message;
    return item.message;
}

/** Same-origin /api calls use the existing Vite proxy. No secrets in localStorage. */
export async function apiRequest<T>(path: `/api/${string}`, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, { ...init, credentials: "include", headers: { Accept: "application/json", ...init.headers } });
    let body: unknown;
    try { body = await response.json(); } catch { throw new ApiError(response.status, "Unexpected API response"); }
    if (!response.ok) throw new ApiError(response.status, errorMessage(body) ?? `Request failed (${response.status})`);
    if (!body || typeof body !== "object" || !("success" in body) || (body as Envelope<T>).success !== true || !("data" in body)) {
        throw new ApiError(response.status, "Invalid API response format");
    }
    return (body as { data: T }).data;
}

export async function getCsrfToken(): Promise<string> {
    const result = await apiRequest<{ csrfToken: string }>("/api/v1/auth/csrf");
    return result.csrfToken;
}

/** Obtain a fresh CSRF token before writes; auth UI will use this in EC-010. */
export async function apiMutation<T>(path: `/api/${string}`, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
    const csrfToken = await getCsrfToken();
    return apiRequest<T>(path, {
        method,
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
