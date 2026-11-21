/**
 * EC-016.3: screenshot capture of the real storefront UI with synthetic, mocked API data.
 * Dedicated port 5191 avoids colliding with native/Docker dev (:5173) and normal E2E (:5187).
 * Never starts the backend, connects to PostgreSQL or reads local .env files.
 * The showcase-specific Vite config sends unmatched API requests to a disabled endpoint.
 */
import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baseURL = "http://127.0.0.1:5191";

export default defineConfig({
    testDir: "./e2e",
    testMatch: /showcase\.e2e\.ts$/,
    fullyParallel: false,
    workers: 1,
    forbidOnly: true,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 8_000 },
    reporter: [["list"]],
    outputDir: path.join(os.tmpdir(), "commercelab-ec0163-playwright-artifacts"),
    use: {
        baseURL,
        locale: "en-US",
        timezoneId: "Europe/Istanbul",
        colorScheme: "light",
        reducedMotion: "reduce",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{
        name: "chromium-showcase",
        use: {
            ...devices["Desktop Chrome"],
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 1,
        },
    }],
    webServer: {
        command: "pnpm --filter @commercelab/web exec vite --config vite.config.showcase.ts --host 127.0.0.1 --port 5191 --strictPort",
        cwd: repoRoot,
        url: baseURL,
        timeout: 90_000,
        reuseExistingServer: false,
    },
});
