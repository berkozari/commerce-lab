#!/usr/bin/env node
/**
 * CommerceLab EC-015.8 — final CI contract + disposable clean-install validation.
 * apply: add one read-only workflow verification step.
 * verify: static guards and existing verifiers; no database, Docker, or secrets.
 * clean: export committed HEAD to a temporary checkout, frozen install,
 *        Prisma generate, Chromium install and EC-014 quality regression.
 * Never deletes or resets local databases, Docker volumes, or project modules.
 */
import {
    existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pathInRepo = (rel) => join(root, rel);
const workflowRel = ".github/workflows/ci.yml";
const workflowAnchor = "      - name: Validate EC-015.7 infrastructure health contract\n        run: node scripts/ec015-7-infrastructure.mjs verify";
const finalStep = "      - name: Validate EC-015.8 final CI contract\n        run: node scripts/ec015-8-final.mjs verify\n\n";
const finalCommand = "run: node scripts/ec015-8-final.mjs verify";
const requiredFiles = [
    "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json",
    "quality/ec014-coverage-baseline.json",
    "scripts/ec014-6-quality-regression.sh",
    "scripts/ec015-5-ci.mjs", "scripts/ec015-5-node24-actions.mjs",
    "scripts/ec015-6-ci.mjs", "scripts/ec015-7-infrastructure.mjs",
    "apps/api/scripts/ec015-6-ci-postgres.mjs",
    "apps/api/tests/integration/health-readiness.test.ts",
    "apps/web/playwright.config.ts",
    "docker/compose.dev.yml", "docker/compose.full-dev.yml",
];

function fail(message) {
    throw new Error(message);
}
function check(condition, message) {
    if (!condition) fail(message);
}
function pass(message) { console.log(`PASS | ${message}`); }
function read(rel) { return readFileSync(pathInRepo(rel), "utf8"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function runSafe(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? root,
        env: options.env ?? process.env,
        stdio: options.stdio ?? "inherit",
        encoding: options.stdio === "pipe" ? "utf8" : undefined,
        timeout: options.timeout ?? 120000,
        maxBuffer: 4 * 1024 * 1024,
    });
    check(!result.error && result.status === 0,
        `${options.label ?? command} failed (exit ${result.status ?? "unknown"})`);
    return result;
}
function sourceContract(requireFinalStep = true) {
    for (const rel of requiredFiles) {
        check(existsSync(pathInRepo(rel)), `Missing required project file: ${rel}`);
    }
    const y = read(workflowRel);
    check(y.includes("name: CommerceLab CI"), "Canonical CI workflow not found");
    check(y.includes("permissions:\n  contents: read"), "Least-privilege CI permissions changed");
    check(y.includes("concurrency:") && y.includes("cancel-in-progress: true"),
        "CI concurrency guard missing");
    const split = y.split(/^ {2}postgres-integration:\s*$/m);
    check(split.length === 2, "Expected one PostgreSQL integration job");
    const [quality, database] = split;
    check(/^ {2}quality:\s*$/m.test(quality), "Expected one quality job");
    for (const piece of [
        "EC014_E2E_LIVE: '0'", "pnpm install --frozen-lockfile",
        "node scripts/ec015-7-infrastructure.mjs verify",
        "bash scripts/ec014-6-quality-regression.sh --check",
        "playwright install --with-deps chromium",
        "actions/upload-artifact@v6", "if: always()",
    ]) check(quality.includes(piece), `Quality job missing: ${piece}`);
    for (const piece of [
        "image: postgres:17-alpine", "'5433:5432'",
        "node apps/api/scripts/ec015-6-ci-postgres.mjs prepare",
        "node apps/api/scripts/ec015-6-ci-postgres.mjs run",
        "pnpm install --frozen-lockfile", "actions/upload-artifact@v6",
    ]) check(database.includes(piece), `PostgreSQL job missing: ${piece}`);
    for (const piece of [
        "actions/checkout@v6", "pnpm/action-setup@v6", "actions/setup-node@v6",
        "node-version: '22'", "version: 10",
    ]) check(occurrences(y, piece) === 2, `Expected both jobs to use ${piece}`);
    check(!/\bmigrate\s+reset\b|\bdocker\s+volume\s+(?:prune|rm)\b|\bdown\s+-v\b/i.test(y),
        "Unsafe database or Docker operation in CI");
    check(occurrences(quality, "run: node scripts/ec015-7-infrastructure.mjs verify") === 1,
        "Expected one EC-015.7 health contract step");
    if (requireFinalStep) {
        check(occurrences(y, finalCommand) === 1 && quality.includes(finalCommand),
            "Expected one EC-015.8 final contract step in the quality job; run apply");
    }
    pass("Canonical two-job CI, Node 24 actions, frozen install and coverage gate preserved");
}
function assertNoTrackedSecrets() {
    const result = spawnSync("git", ["ls-files", "-z"], {
        cwd: root, encoding: "buffer", maxBuffer: 8 * 1024 * 1024,
        timeout: 10000,
    });
    check(!result.error && result.status === 0, "Cannot list Git tracked files");
    const tracked = result.stdout.toString("utf8").split("\0").filter(Boolean);
    const forbidden = tracked.filter((name) =>
        /(?:^|\/)\.env(?:\.[^/]*)?$/.test(name) && !name.endsWith(".env.example"));
    check(forbidden.length === 0, "A real .env file is tracked by Git");
    check(tracked.every((name) => !name.startsWith(".reports/") &&
        !name.startsWith("node_modules/") && !name.startsWith("apps/api/src/generated/prisma/")),
    "Tracked generated files or local reports detected");
    pass("Git index excludes real .env files, generated Prisma client and local reports");
}
function verify() {
    sourceContract();
    assertNoTrackedSecrets();
    for (const script of [
        "scripts/ec015-5-ci.mjs",
        "scripts/ec015-5-node24-actions.mjs",
        "scripts/ec015-6-ci.mjs",
        "scripts/ec015-7-infrastructure.mjs",
    ]) runSafe(process.execPath, [script, "verify"], { label: script });
    pass("Existing EC-015.5, EC-015.6 and EC-015.7 safeguards verified");
    console.log("EC-015.8 STATIC VERIFY PASS");
}
function apply() {
    sourceContract(false);
    const y = read(workflowRel);
    if (y.includes(finalCommand)) {
        check(occurrences(y, finalCommand) === 1, "Duplicated EC-015.8 CI step");
        verify();
        pass("Final contract step already present (idempotent)");
        return;
    }
    check(occurrences(y, workflowAnchor) === 1,
        "EC-015.7 workflow anchor is missing or duplicated; refusing to rewrite CI");
    const updated = y.replace(workflowAnchor, finalStep + workflowAnchor);
    check(updated !== y, "CI workflow unchanged");
    const backupDir = pathInRepo(".reports/ec015-8");
    mkdirSync(backupDir, { recursive: true });
    const backup = join(backupDir, "ci.yml.before");
    if (!existsSync(backup)) writeFileSync(backup, y, { flag: "wx", mode: 0o600 });
    writeFileSync(pathInRepo(workflowRel), updated);
    verify();
    pass("Added one EC-015.8 static verification step without adding a CI job");
}
function strictHead() {
    check(process.env.GITHUB_ACTIONS !== "true", "Clean mode is local-only; never run in Actions");
    runSafe("git", ["rev-parse", "--verify", "HEAD"], { stdio: "ignore", label: "Git HEAD" });
    const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
        cwd: root, encoding: "utf8", timeout: 10000,
    });
    check(!status.error && status.status === 0, "Cannot read Git working-tree status");
    check(status.stdout.trim() === "",
        "Working tree is not clean. Commit/review EC-015.7 and EC-015.8 changes before clean validation");
    runSafe("git", ["cat-file", "-e", "HEAD:scripts/ec015-8-final.mjs"], {
        stdio: "ignore", label: "EC-015.8 must be committed",
    });
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    check(nodeMajor >= 22, "Local Node.js 22+ is required; CI uses Node.js 22");
    const pnpm = spawnSync("pnpm", ["--version"], {
        cwd: root, encoding: "utf8", timeout: 15000,
    });
    check(!pnpm.error && pnpm.status === 0, "pnpm not available in PATH");
    check(/^10\./.test(pnpm.stdout.trim()), "Use pnpm 10, matching CI and the frozen lockfile");
    pass("Clean Git HEAD and Node.js/pnpm prerequisites confirmed");
}
function cleanEnvironment() {
    const env = { ...process.env, CI: "true", EC014_E2E_LIVE: "0" };
    for (const key of Object.keys(env)) {
        if (/^(?:PG[A-Z_]*|POSTGRES_|DATABASE_|AUTH_|COMMERCE_DB_)/.test(key)) delete env[key];
    }
    for (const key of ["DIRECT_URL", "EC014_E2E_DATABASE_URL", "EC0156_POSTGRES_PASSWORD",
        "NODE_ENV", "COMMERCE_DOCKER_DEV"]) delete env[key];
    return env;
}
function clean() {
    verify();
    strictHead();
    const temp = mkdtempSync(join(tmpdir(), "commercelab-ec0158-"));
    const exported = join(temp, "snapshot");
    const archive = join(temp, "tracked.tar");
    mkdirSync(exported);
    const env = cleanEnvironment();
    let success = false;
    try {
        runSafe("git", ["archive", "--format=tar", "--output", archive, "HEAD"], {
            label: "Git HEAD archive", timeout: 60000,
        });
        runSafe("tar", ["-xf", archive, "-C", exported], {
            label: "Extract committed source", timeout: 60000,
        });
        rmSync(archive);
        check(!existsSync(join(exported, ".env")) &&
            !existsSync(join(exported, "apps/api/.env")) &&
            !existsSync(join(exported, "docker/.env")),
        "A real .env appeared in the committed snapshot; aborting clean install");
        pass("Clean isolated source export from committed HEAD (no local .env/node_modules)");
        runSafe("pnpm", ["install", "--frozen-lockfile"], {
            cwd: exported, env, timeout: 900000, label: "Frozen pnpm install",
        });
        pass("Frozen pnpm install passed in isolated checkout");
        runSafe("pnpm", ["--filter", "@commercelab/api", "exec", "prisma", "generate"], {
            cwd: exported, env, timeout: 180000, label: "Prisma generate",
        });
        pass("Prisma client generated without a development database");
        runSafe("pnpm", ["--filter", "@commercelab/web", "exec", "playwright", "install", "chromium"], {
            cwd: exported, env, timeout: 600000, label: "Install Playwright Chromium",
        });
        runSafe("bash", ["scripts/ec014-6-quality-regression.sh", "--check"], {
            cwd: exported, env, timeout: 1200000, label: "Full quality regression",
        });
        pass("Lint, types, builds, API/Web coverage and 6 mock browser tests passed");
        const sha = spawnSync("git", ["rev-parse", "HEAD"], {
            cwd: root, encoding: "utf8", timeout: 10000,
        });
        check(!sha.error && sha.status === 0, "Cannot determine tested commit");
        mkdirSync(pathInRepo(".reports/ec015-8"), { recursive: true });
        writeFileSync(pathInRepo(".reports/ec015-8/clean-install-summary.txt"),
            `EC-015.8 CLEAN INSTALL PASS\ncommit=${sha.stdout.trim()}\n` +
            "frozen_install=PASS\nprisma_generate=PASS\nquality_gate=PASS\n" +
            "postgres_integration=CI_ONLY\nlocal_database_untouched=true\n",
        { mode: 0o600 });
        success = true;
        console.log("EC-015.8 CLEAN INSTALL PASS");
        console.log("INFO | PostgreSQL 42-test suite requires separate green GitHub Actions job");
    } finally {
        if (success) rmSync(temp, { recursive: true, force: true });
        else console.error(`INFO | Failed clean-install snapshot kept for inspection: ${temp}`);
    }
}

const mode = process.argv[2];
if (process.argv.length !== 3 || !["apply", "verify", "clean"].includes(mode))
    fail("Usage: node scripts/ec015-8-final.mjs apply|verify|clean");
try {
    if (mode === "apply") apply();
    else if (mode === "verify") verify();
    else clean();
} catch (error) {
    console.error(`FAIL | EC-015.8 | ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
