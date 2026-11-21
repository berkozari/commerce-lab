/**
 * Generate local, gitignored Docker-only application settings without touching
 * the existing docker/.env or changing the existing PostgreSQL credentials.
 * `docker compose config` resolves exactly the same password as Postgres does.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, openSync, writeFileSync, closeSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dotenvPath = resolve(root, "docker/.env");
const output = resolve(root, "docker/.env.full");
if (!existsSync(dotenvPath)) {
  throw new Error("docker/.env is missing. Keep your existing COMMERCE_DB_PASSWORD; do not invent a new password for a persisted DB.");
}
if (existsSync(output)) {
  console.log("docker/.env.full already exists; leaving existing credentials unchanged.");
  process.exit(0);
}
const args = ["compose", "--env-file", "docker/.env", "-f", "docker/compose.dev.yml", "config", "--format", "json"];
const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
if (result.error || result.status !== 0) {
  // Never print stdout/stderr here: Compose config can include secrets.
  throw new Error("Cannot validate existing Docker Compose configuration. Check Docker Compose V2 and docker/.env.");
}
let config;
try { config = JSON.parse(result.stdout); } catch { throw new Error("Docker Compose did not return valid JSON configuration."); }
const db = config?.services?.postgres?.environment;
if (db?.POSTGRES_USER !== "commercelab" || db?.POSTGRES_DB !== "commercelab_dev" ||
    typeof db?.POSTGRES_PASSWORD !== "string" || !db.POSTGRES_PASSWORD ||
    db.POSTGRES_PASSWORD.startsWith("REPLACE_")) {
  throw new Error("Unexpected PostgreSQL identity/credentials in existing Compose; refusing to generate Docker app credentials.");
}
const url = `postgresql://commercelab:${encodeURIComponent(db.POSTGRES_PASSWORD)}@postgres:5432/commercelab_dev`;
const lines = [
  "# Local EC-015.2 full-stack Docker application env (generated, DO NOT COMMIT)",
  `COMMERCE_DOCKER_DATABASE_URL=${url}`,
  `COMMERCE_AUTH_JWT_SECRET=${randomBytes(48).toString("hex")}`,
  `COMMERCE_AUTH_CSRF_SECRET=${randomBytes(48).toString("hex")}`,
  "",
];
// Exclusive create: never overwrite an existing secrets file.
const fd = openSync(output, "wx", 0o600);
try { writeFileSync(fd, lines.join("\n")); } finally { closeSync(fd); }
chmodSync(output, 0o600);
console.log("Created docker/.env.full (mode 0600). Existing Docker Postgres password and database were not changed.");
