import { defineConfig } from "vite";
import { env as processEnv } from "node:process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dockerDev = processEnv.COMMERCE_DOCKER_DEV === "1";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: dockerDev ? "0.0.0.0" : "127.0.0.1",
        port: 5173,
        proxy: { "/api": { target: dockerDev ? "http://api:3000" : "http://127.0.0.1:3000", changeOrigin: true } },
    },
});
