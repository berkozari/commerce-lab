import "dotenv/config";
import { parseTrustedProxyCidrs } from "./trusted-proxies.js";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
    TRUSTED_PROXY_CIDRS: z.string().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    SLOW_REQUEST_MS: z.coerce.number().int().min(1).max(60000).default(1000),
    AUTH_JWT_SECRET: z.string().min(32).refine((value) => !value.startsWith("REPLACE_"), "Secret must be replaced").optional(),
    AUTH_CSRF_SECRET: z.string().min(32).refine((value) => !value.startsWith("REPLACE_"), "Secret must be replaced").optional(),
}).superRefine((config, ctx) => {
    const origin = new URL(config.CORS_ORIGIN);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== config.CORS_ORIGIN) {
        ctx.addIssue({
            code: "custom",
            path: ["CORS_ORIGIN"],
            message: "CORS_ORIGIN must be an exact HTTP(S) origin (scheme, host and optional port only)",
        });
    }
    if (config.NODE_ENV === "production" && origin.protocol !== "https:") {
        ctx.addIssue({
            code: "custom",
            path: ["CORS_ORIGIN"],
            message: "Production CORS_ORIGIN must use HTTPS for secure cookie authentication",
        });
    }
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}
export const env = result.data;

// Fail fast if explicitly configured proxy IPs are invalid.
// Empty configuration keeps Express' secure trust-proxy=false default.
export const trustedProxyCidrs = parseTrustedProxyCidrs(env.TRUSTED_PROXY_CIDRS);

export function requireDatabaseUrl(): string {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured for database operations");
    return env.DATABASE_URL;
}

export function requireAuthSecrets(): { jwtSecret: string; csrfSecret: string } {
    if (!env.AUTH_JWT_SECRET || !env.AUTH_CSRF_SECRET) {
        throw new Error("AUTH_JWT_SECRET and AUTH_CSRF_SECRET must each be at least 32 characters");
    }
    return { jwtSecret: env.AUTH_JWT_SECRET, csrfSecret: env.AUTH_CSRF_SECRET };
}
