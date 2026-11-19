/** Accept only relative, application-local paths; reject protocol-relative URLs. */
export function safeReturnPath(value: unknown): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/account";
    return value;
}
