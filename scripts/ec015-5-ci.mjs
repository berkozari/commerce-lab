#!/usr/bin/env node
// EC-015.5: safely replace the old EC-014 workflow with one canonical CI workflow.
// Does not perform Git operations, access the database, or read any .env files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = path.join(root, '.github/workflows/ec014-quality.yml');
const canonical = path.join(root, '.github/workflows/ci.yml');
const backup = path.join(root, '.reports/ec015-5/ec014-quality.yml.backup');
const requiredFiles = [
  'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'quality/ec014-coverage-baseline.json',
  'scripts/ec014-6-quality-regression.sh',
  'apps/web/playwright.config.ts',
  'apps/api/package.json', 'apps/web/package.json',
];

function fail(msg) { console.error(`FAIL | EC-015.5 | ${msg}`); process.exit(1); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function assertProject() {
  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(root, rel))) fail(`Missing required source file: ${rel}`);
  }
}
function assertCanonical() {
  if (!fs.existsSync(canonical) || !fs.statSync(canonical).isFile())
    fail('Missing .github/workflows/ci.yml. Extract the ZIP at the repository root.');
  const y = read(canonical);
  for (const required of [
    'name: CommerceLab CI',
    'permissions:', 'contents: read', 'concurrency:',
    'pull_request:', "'feature/**'", 'workflow_dispatch:',
    'pnpm install --frozen-lockfile',
    'actions/checkout@v6', 'pnpm/action-setup@v6', 'actions/setup-node@v6',
    'playwright install --with-deps chromium',
    'bash scripts/ec014-6-quality-regression.sh --check',
    'EC014_E2E_LIVE:', 'actions/upload-artifact@v6',
  ]) if (!y.includes(required)) fail(`CI workflow missing expected entry: ${required}`);
  if (!/^\s*EC014_E2E_LIVE:\s*['"]0['"]\s*$/m.test(y))
    fail('CI must keep real database E2E disabled (EC014_E2E_LIVE=0).');
  if (/migrate\s+(?:reset|deploy)|prisma\s+db\s+seed/.test(y))
    fail('This workflow must not mutate a database (defer to EC-015.6).');
}
function assertLegacySafe() {
  const y = read(legacy);
  for (const required of [
    'name: EC-014 Quality Gates',
    'bash scripts/ec014-6-quality-regression.sh --check',
    'actions/upload-artifact@v4',
  ]) if (!y.includes(required)) fail(`Unexpected modifications in legacy workflow: missing ${required}. Review manually.`);
  return y;
}
function apply() {
  assertProject(); assertCanonical();
  if (!fs.existsSync(legacy)) {
    console.log('PASS | Canonical CI workflow already present; no legacy workflow to migrate.');
    return;
  }
  const old = assertLegacySafe();
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (fs.existsSync(backup)) {
    if (read(backup) !== old) fail('A DIFFERENT legacy backup exists. Inspect .reports/ec015-5 before proceeding.');
  } else {
    fs.writeFileSync(backup, old, { flag: 'wx', mode: 0o600 });
  }
  // New workflow is validated and the legacy one is backed up. Remove the
  // legacy to avoid duplicate CI runs on every push and pull request.
  fs.unlinkSync(legacy);
  console.log('PASS | Legacy EC-014 workflow backed up under ignored .reports/ec015-5/');
  console.log('PASS | Using only .github/workflows/ci.yml');
}
function verify() {
  assertProject(); assertCanonical();
  if (fs.existsSync(legacy)) fail('Legacy workflow still exists. Run apply first; do not keep duplicate CI workflows.');
  console.log('PASS | Exactly one intended CommerceLab quality workflow');
  console.log('PASS | Least-privilege, frozen install, isolated mocked-browser E2E and report upload checks');
  console.log('INFO | Local static checks only. GitHub Actions status must be verified after pushing.');
}
const mode = process.argv[2];
if (process.argv.length !== 3 || !['apply', 'verify'].includes(mode))
  fail('Usage: node scripts/ec015-5-ci.mjs apply|verify');
if (mode === 'apply') apply(); else verify();
