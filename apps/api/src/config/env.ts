import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
    // Do not print values of secret environment variables.
    throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}
export const env = result.data;

export function requireDatabaseUrl(): string {
    if (!env.DATABASE_URL) {
        throw new Error("DATABASE_URL must be configured for database operations");
    }
    return env.DATABASE_URL;
}
