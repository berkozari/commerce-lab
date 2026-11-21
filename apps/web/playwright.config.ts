import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

const live = process.env.EC014_E2E_LIVE === "1";
const webRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(webRoot, "../..");
const webUrl = "http://127.0.0.1:5187";

// Full-stack E2E changes database rows. Never launch it against a normal dev DB.
if (live) {
    const connection = process.env.EC014_E2E_DATABASE_URL;
    if (!connection) throw new Error("EC014_E2E_DATABASE_URL is required in live mode");
    const parsed = new URL(connection);
    const database = decodeURIComponent(parsed.pathname.slice(1));
    if (!(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) && /^commercelab_e2e_[a-z0-9_]+$/.test(database))) {
        throw new Error("Live E2E only accepts a local database named commercelab_e2e_*");
    }
}

const liveApiEnv = live ? {
    NODE_ENV: "test",
    DATABASE_URL: process.env.EC014_E2E_DATABASE_URL!,
    AUTH_JWT_SECRET: randomBytes(32).toString("hex"),
    AUTH_CSRF_SECRET: randomBytes(32).toString("hex"),
    HOST: "127.0.0.1",
    PORT: "3187",
    CORS_ORIGIN: webUrl,
} : undefined;

export default defineConfig({
    testDir: "./e2e",
    testMatch: live ? /live\.e2e\.ts$/ : /browser\.e2e\.ts$/,
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 8_000 },
    reporter: [["list"]],
    outputDir: path.join(os.tmpdir(), "commercelab-ec014-5-playwright-artifacts"),
    use: {
        baseURL: webUrl,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: [
        ...(live ? [{
            command: "pnpm --filter @commercelab/api dev",
            cwd: repoRoot,
            url: "http://127.0.0.1:3187/api/v1/health/ready",
            env: liveApiEnv,
            timeout: 90_000,
            reuseExistingServer: false,
        }] : []),
        {
            command: "pnpm --filter @commercelab/web exec vite --config vite.config.e2e.ts --host 127.0.0.1 --port 5187 --strictPort",
            cwd: repoRoot,
            url: webUrl,
            timeout: 90_000,
            reuseExistingServer: false,
        },
    ],
});
