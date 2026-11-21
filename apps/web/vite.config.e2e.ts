/**
 * Dedicated Vite configuration for the EC-014.5 live E2E stack.
 * Preserve all regular Vite plugins and other options, but proxy /api ONLY
 * to the separate Playwright-managed E2E backend (not the dev API on :3000).
 */
import { mergeConfig } from "vite";
import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
    server: {
        proxy: {
            "/api": {
                target: "http://127.0.0.1:3187",
                changeOrigin: true,
            },
        },
    },
});
