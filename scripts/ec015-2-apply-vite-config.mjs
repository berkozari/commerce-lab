/**
 * Strict, idempotent EC-015.2 patch: only change Vite's host and API proxy in
 * opt-in Docker mode. Native pnpm dev and Playwright continue unchanged.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "apps/web/vite.config.ts");
const original = readFileSync(path, "utf8");
const marker = 'processEnv.COMMERCE_DOCKER_DEV === "1"';

if (original.includes(marker)) {
  if (!original.includes('"http://api:3000"') || !original.includes('"0.0.0.0"')) {
    throw new Error("A Docker Vite marker exists, but the expected host/proxy configuration is missing. Review manually.");
  }
  console.log("EC-015.2 Vite configuration already applied; no changes.");
  process.exit(0);
}

const oldHost = 'host: "127.0.0.1",';
const oldProxy = 'target: "http://127.0.0.1:3000", changeOrigin: true';
for (const [label, needle] of [["host", oldHost], ["proxy", oldProxy]]) {
  if (original.split(needle).length !== 2) {
    throw new Error(`Unexpected Vite ${label} configuration. Refusing to overwrite a changed file.`);
  }
}

const replacement = original
  .replace('import { defineConfig } from "vite";', 'import { defineConfig } from "vite";\nimport { env as processEnv } from "node:process";')
  .replace('export default defineConfig({', 'const dockerDev = processEnv.COMMERCE_DOCKER_DEV === "1";\n\nexport default defineConfig({')
  .replace(oldHost, 'host: dockerDev ? "0.0.0.0" : "127.0.0.1",')
  .replace(oldProxy, 'target: dockerDev ? "http://api:3000" : "http://127.0.0.1:3000", changeOrigin: true');
if (replacement === original) throw new Error("Vite configuration unchanged; refusing to continue.");
const backup = resolve(root, ".reports/ec015-2/vite.config.ts.before");
mkdirSync(dirname(backup), { recursive: true });
writeFileSync(backup, original, { flag: "wx" });
writeFileSync(path, replacement);
console.log("EC-015.2 Vite config patched. Original backed up in .reports/ec015-2 (Git ignored).");
