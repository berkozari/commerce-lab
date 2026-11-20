import { isIP } from "node:net";

/**
 * Accept only explicitly configured IPs or CIDRs for proxies we operate.
 * Do not support "true", hop counts, wildcards, or all-address subnets.
 */
export function parseTrustedProxyCidrs(value: string | undefined): string[] {
    if (!value?.trim()) return [];

    return value.split(",").map((rawEntry) => {
        const entry = rawEntry.trim();
        const parts = entry.split("/");
        const address = parts[0] ?? "";
        const family = isIP(address);

        if (parts.length > 2 || family === 0) {
            throw new Error(`Invalid TRUSTED_PROXY_CIDRS entry: ${entry || "(empty)"}`);
        }

        if (parts.length === 2) {
            const prefix = parts[1] ?? "";
            const maxBits = family === 4 ? 32 : 128;
            if (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > maxBits) {
                throw new Error(`Invalid TRUSTED_PROXY_CIDRS network prefix: ${entry}`);
            }
        }

        return entry;
    });
}
