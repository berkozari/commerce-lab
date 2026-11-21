#!/usr/bin/env node
/**
 * EC-015.7 — read-only infrastructure health contract verification.
 * apply: change one CI workflow step, with no Docker/database access.
 * verify: static CI-safe checks, no Docker/credentials required.
 * local: verify running Docker services and HTTP health endpoints (read-only).
 * Never prints Compose config, container env, auth tokens, or .env contents.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (rel) => join(root, rel);
const read = (rel) => readFileSync(file(rel), "utf8");
const workflowFile = ".github/workflows/ci.yml";
const workflowAnchor = "      - name: Lint, typechecks, build, coverage gate and mocked-browser E2E";
const ciStep = "      - name: Validate EC-015.7 infrastructure health contract\n        run: node scripts/ec015-7-infrastructure.mjs verify\n\n";

function fail(message) {
    console.error(`FAIL | EC-015.7 | ${message}`);
    process.exit(1);
}
function assert(condition, message) {
    if (!condition) fail(message);
}
function pass(message) { console.log(`PASS | ${message}`); }
function requiredText(rel) {
    assert(existsSync(file(rel)), `Missing source file: ${rel}`);
    return read(rel);
}
function contains(text, expected, context) {
    assert(text.includes(expected), `${context}: missing ${expected}`);
}
function service(composeText, name, context) {
    const start = new RegExp(`^ {2}${name}:\\s*$`, "m");
    const match = start.exec(composeText);
    assert(match, `${context}: ${name} service not found`);
    const rest = composeText.slice(match.index + match[0].length);
    const next = /^(?: {2}[a-z][\w-]*:|[a-z][\w-]*:)\s*$/m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
}
function assertStatic({ expectCI = true } = {}) {
    const base = requiredText("docker/compose.dev.yml");
    const overlay = requiredText("docker/compose.full-dev.yml");
    const health = requiredText("apps/api/src/routes/health.routes.ts");
    const vite = requiredText("apps/web/vite.config.ts");
    const workflow = requiredText(workflowFile);

    assert(/^name:\s*commerce-lab-dev\s*$/m.test(base), "Compose project name changed");
    const postgres = service(base, "postgres", "base Compose");
    for (const piece of ["postgres:17-alpine", '"127.0.0.1:5433:5432"',
        "commerce_pg_data:/var/lib/postgresql/data", "pg_isready -U commercelab -d commercelab_dev",
        "healthcheck:", "retries:"]) contains(postgres, piece, "postgres");
    const api = service(overlay, "api", "full-stack overlay");
    const web = service(overlay, "web", "full-stack overlay");
    for (const [name, section, port, target, dependency] of [
        ["api", api, "3000", "/api/v1/health/ready", "postgres"],
        ["web", web, "5173", "http://127.0.0.1:5173/", "api"],
    ]) {
        contains(section, `"127.0.0.1:${port}:${port}"`, name);
        contains(section, "healthcheck:", name);
        contains(section, target, name);
        contains(section, "condition: service_healthy", name);
        assert(new RegExp(`^ {6}${dependency}:\\s*$`, "m").test(section),
            `${name}: expected dependency ${dependency}`);
        for (const piece of ["interval:", "timeout:", "retries:", "start_period:"])
            contains(section, piece, `${name} healthcheck`);
    }
    contains(api, "HOST: \"0.0.0.0\"", "API container bind");
    contains(web, "COMMERCE_DOCKER_DEV:", "web Docker flag");
    for (const piece of ["COMMERCE_DOCKER_DEV", '"0.0.0.0"',
        '"http://api:3000"', '"http://127.0.0.1:3000"'])
        contains(vite, piece, "Vite dual-mode proxy");
    for (const piece of ['healthRouter.get("/live"', 'healthRouter.get("/ready"',
        "getPrisma().$queryRaw", "res.status(503)", 'database: "unavailable"',
        'status: "ready"']) contains(health, piece, "API health routes");
    assert(!/\b(?:migrate\s+reset|docker\s+volume\s+(?:rm|prune)|down\s+-v)\b/i.test(overlay),
        "Unsafe volume/database command in Docker overlay");
    for (const piece of ["name: CommerceLab CI", "postgres-integration:",
        "bash scripts/ec014-6-quality-regression.sh --check",
        "node apps/api/scripts/ec015-6-ci-postgres.mjs run"])
        contains(workflow, piece, "canonical CI workflow");
    if (expectCI) {
        assert(workflow.split("run: node scripts/ec015-7-infrastructure.mjs verify").length === 2,
            "Expected exactly one EC-015.7 CI health contract step; run apply");
        const beforePg = workflow.split(/^ {2}postgres-integration:\s*$/m)[0];
        contains(beforePg, "run: node scripts/ec015-7-infrastructure.mjs verify",
            "quality job infrastructure check");
    }
    pass("Compose project, ports, persistent database volume and healthchecks match EC-015.7 contract");
    pass("API liveness/readiness and Vite proxy paths are configured");
    if (expectCI) pass("Canonical quality CI job verifies the infrastructure health contract");
}
function apply() {
    assertStatic({ expectCI: false });
    const workflow = read(workflowFile);
    if (workflow.includes(ciStep.trimEnd())) {
        assertStatic();
        pass("EC-015.7 CI health contract step already present (idempotent)");
        return;
    }
    assert(workflow.split(workflowAnchor).length === 2,
        "Canonical quality step changed or duplicated; refusing to overwrite workflow");
    assert(workflow.includes("  postgres-integration:"),
        "EC-015.6 PostgreSQL job missing; refusing to change workflow");
    const updated = workflow.replace(workflowAnchor, ciStep + workflowAnchor);
    assert(updated !== workflow, "CI workflow unchanged");
    writeFileSync(file(workflowFile), updated);
    assertStatic();
    pass("EC-015.7 CI step added without changing other jobs");
}
function run(command, args, timeout = 16000) {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout,
        maxBuffer: 4 * 1024 * 1024, env: process.env });
    // Never echo raw stderr/stdout: Docker Compose may interpolate credentials.
    assert(!result.error && result.status === 0,
        `Command failed: ${command} (arguments/output intentionally withheld)`);
    return result.stdout.trim();
}
function jsonResult(command, args) {
    const output = run(command, args);
    try { return JSON.parse(output); }
    catch { fail(`Invalid JSON from ${command} (raw output withheld)`); }
}
function assertPublished(ports, key, port) {
    const list = ports?.[`${key}/tcp`];
    assert(Array.isArray(list) && list.some((p) => p.HostIp === "127.0.0.1" && p.HostPort === String(port)),
        `Unexpected host port binding for ${key}/tcp; expected 127.0.0.1:${port}`);
}
function assertComposePort(portEntries, published, target) {
    assert(Array.isArray(portEntries) && portEntries.some((p) =>
        String(p.published) === String(published) && Number(p.target) === target && p.host_ip === "127.0.0.1"),
        `Compose port ${published}:${target} must bind only to 127.0.0.1`);
}
async function http(url, validator, label, asText = false) {
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(4500), redirect: "error" }); }
    catch { fail(`${label}: request could not be completed`); }
    assert(response.status === 200, `${label}: expected HTTP 200, got ${response.status}`);
    let data;
    try { data = asText ? await response.text() : await response.json(); }
    catch { fail(`${label}: invalid response body`); }
    assert(validator(data, response), `${label}: unexpected response content`);
    pass(`${label}: HTTP 200 and expected response`);
}
async function local() {
    assert(process.env.GITHUB_ACTIONS !== "true", "local mode must not run on GitHub Actions");
    assertStatic();
    for (const rel of ["docker/.env", "docker/.env.full"])
        assert(existsSync(file(rel)), `${rel} not found; do not recreate an existing DB password`);
    const base = ["compose", "--env-file", "docker/.env", "--env-file", "docker/.env.full",
        "-f", "docker/compose.dev.yml", "-f", "docker/compose.full-dev.yml"];
    const config = jsonResult("docker", [...base, "config", "--format", "json"]);
    assert(config.name === "commerce-lab-dev", "Unexpected resolved Compose project identity");
    const postgres = config.services?.postgres;
    const api = config.services?.api;
    const web = config.services?.web;
    assert(postgres && api && web, "Missing resolved Compose service(s)");
    assert(postgres.image === "postgres:17-alpine", "Wrong PostgreSQL image");
    assertComposePort(postgres.ports, 5433, 5432);
    assertComposePort(api.ports, 3000, 3000);
    assertComposePort(web.ports, 5173, 5173);
    assert(api.depends_on?.postgres?.condition === "service_healthy" &&
        web.depends_on?.api?.condition === "service_healthy", "Health-aware startup order changed");
    for (const [name, serviceConfig] of [["postgres", postgres], ["api", api], ["web", web]]) {
        assert(Array.isArray(serviceConfig.healthcheck?.test) && serviceConfig.healthcheck.test.length >= 2,
            `Missing effective Docker healthcheck for ${name}`);
    }
    pass("Resolved Compose project, local-only ports and health-aware dependencies verified");

    for (const [name, published, target] of [["postgres", 5433, 5432],
        ["api", 3000, 3000], ["web", 5173, 5173]]) {
        const id = run("docker", [...base, "ps", "-q", name]);
        assert(/^\S+$/.test(id), `${name}: expected exactly one running container`);
        const state = jsonResult("docker", ["inspect", "--format", "{{json .State}}", id]);
        const labels = jsonResult("docker", ["inspect", "--format", "{{json .Config.Labels}}", id]);
        const ports = jsonResult("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", id]);
        assert(state.Running === true && state.Health?.Status === "healthy",
            `${name}: container not running/healthy (health=${String(state.Health?.Status ?? "unknown")})`);
        assert(labels["com.docker.compose.project"] === "commerce-lab-dev" &&
            labels["com.docker.compose.service"] === name, `${name}: unexpected container project/service label`);
        assertPublished(ports, String(target), published);
        if (name === "postgres") {
            const mounts = jsonResult("docker", ["inspect", "--format", "{{json .Mounts}}", id]);
            assert(mounts.some((mount) => mount.Type === "volume" &&
                mount.Name === "commerce-lab-dev_commerce_pg_data" &&
                mount.Destination === "/var/lib/postgresql/data"),
                "PostgreSQL is not using the expected persistent volume");
        }
        pass(`${name}: Docker container healthy, correct identity and host port`);
    }
    const expectedReady = (body) => body?.success === true && body?.data?.status === "ready" &&
        body?.data?.database === "connected";
    await http("http://127.0.0.1:3000/api/v1/health/live",
        (body) => body?.success === true && body?.data?.status === "ok", "API liveness");
    await http("http://127.0.0.1:3000/api/v1/health/ready", expectedReady, "API DB readiness");
    await http("http://127.0.0.1:5173/", (body, response) =>
        response.headers.get("content-type")?.includes("text/html") &&
        /<html[\s>]/i.test(body), "Vite HTML", true);
    await http("http://127.0.0.1:5173/api/v1/health/ready", expectedReady, "Vite-to-API proxy readiness");
    console.log("EC-015.7 INFRASTRUCTURE HEALTH PASS");
}

const [mode, ...rest] = process.argv.slice(2);
if (rest.length || !["apply", "verify", "local"].includes(mode))
    fail("Usage: node scripts/ec015-7-infrastructure.mjs {apply|verify|local}");
if (mode === "apply") apply();
else if (mode === "verify") { assertStatic(); console.log("EC-015.7 HEALTH CONTRACT VERIFY PASS"); }
else await local();
