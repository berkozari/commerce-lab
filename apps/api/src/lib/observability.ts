// Do not emit arbitrary error messages/stacks: they can contain SQL parameters,
// cookies, URLs or other secrets even when structured redaction is configured.
export function safeErrorType(error: unknown): string {
    if (!(error instanceof Error)) return "UnknownError";
    return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : "UnknownError";
}

// Routine 4xx (such as invalid credentials) remain info. Rate limiting,
// slow responses and 5xx are operational warnings, while the centralized
// error handler records actual failures at error severity once.
export function requestLogLevel(
    statusCode: number,
    durationMs: number,
    slowThresholdMs: number,
): "info" | "warn" {
    return statusCode >= 500 || statusCode === 429 || durationMs >= slowThresholdMs ? "warn" : "info";
}

// Log the registered route template instead of the request URL/path, which
// may contain user identifiers or secrets. Unmatched routes have no template.
export function safeRouteTemplate(routePath: unknown): string {
    return typeof routePath === "string" && routePath.startsWith("/") && routePath.length <= 200
        ? routePath
        : "<unmatched>";
}
