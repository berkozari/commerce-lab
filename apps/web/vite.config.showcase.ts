/**
 * Portfolio capture must never forward a request to a real API or database.
 * The showcase Playwright scenario intercepts all /api/v1 requests with mockApi().
 * Any unexpected /api request is instead sent to the local discard port (9),
 * not the native development API, Docker API, or live E2E API.
 */
import { mergeConfig } from "vite";
import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
    server: {
        proxy: {
            "/api": {
                target: "http://127.0.0.1:9",
                changeOrigin: true,
            },
        },
    },
});
