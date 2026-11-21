#!/usr/bin/env node
// EC-015.6: append a dedicated PostgreSQL job to the existing canonical CI.
// Preserves the passing quality job; keeps existing validators compatible.
// No Git operations, no database access, no environment-file access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowRel = '.github/workflows/ci.yml';
const qualityCheckRel = 'scripts/ec015-5-ci.mjs';
const runtimeCheckRel = 'scripts/ec015-5-node24-actions.mjs';
const runnerRel = 'apps/api/scripts/ec015-6-ci-postgres.mjs';
const current = [workflowRel, qualityCheckRel, runtimeCheckRel];
const job = `
  postgres-integration:
    name: PostgreSQL Integration (42 real DB tests)
    runs-on: ubuntu-latest
    timeout-minutes: 25
    # Separate, disposable service. Never connects to the local Docker volume.
    env:
      CI: 'true'
      EC0156_POSTGRES_PASSWORD: 'commerce-ci-ephemeral-only-0156'
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: commercelab
          POSTGRES_PASSWORD: 'commerce-ci-ephemeral-only-0156'
          POSTGRES_DB: postgres
        ports:
          - '5433:5432'
        options: >-
          --health-cmd "pg_isready -U commercelab -d postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Install pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 10

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Install locked dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm --filter @commercelab/api exec prisma generate

      - name: Create and migrate disposable CI test databases
        run: node apps/api/scripts/ec015-6-ci-postgres.mjs prepare

      - name: Execute 42 PostgreSQL integration tests (no skips)
        run: node apps/api/scripts/ec015-6-ci-postgres.mjs run

      - name: Upload PostgreSQL integration reports
        if: always()
        uses: actions/upload-artifact@v6
        with:
          name: ec0156-postgres-\${{ github.run_id }}-\${{ github.run_attempt }}
          if-no-files-found: ignore
          retention-days: 14
          path: .reports/ec015-6
`;

function fail(message) { console.error(`FAIL | EC-015.6 | ${message}`); process.exit(1); }
const getFile = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(getFile(rel), 'utf8');
function replaceRequired(source, old, next, rel) {
  if (source.includes(next)) return source;
  if (!source.includes(old)) fail(`Unexpected format of ${rel}; no changes applied. Review manually.`);
  if (source.indexOf(old) !== source.lastIndexOf(old)) fail(`Ambiguous matches in ${rel}.`);
  return source.replace(old, next);
}
function patchQualityVerifier(original) {
  return replaceRequired(original,
    `  if (/migrate\\s+(?:reset|deploy)|prisma\\s+db\\s+seed/.test(y))\n    fail('This workflow must not mutate a database (defer to EC-015.6).');`,
    `  const qualityOnly = y.split(/\\n  postgres-integration:\\s*\\n/)[0];\n  if (/migrate\\s+(?:reset|deploy)|prisma\\s+db\\s+seed/.test(qualityOnly))\n    fail('The original quality job must remain database-independent.');`,
    qualityCheckRel);
}
function patchRuntimeVerifier(original) {
  let result = replaceRequired(original,
    `    if (found.length !== 1)\n      fail(\`Expected exactly one \${action} reference in \${rel}; found \${found.length}. No files changed.\`);`,
    `    if (found.length < 1)\n      fail(\`Expected at least one \${action} reference in \${rel}; found 0. No files changed.\`);`,
    runtimeCheckRel);
  result = replaceRequired(result,
    `    const version = Number(found[0][1]);\n    if (![4, 6].includes(version))\n      fail(\`Unexpected \${action}@v\${version} in \${rel}; inspect manually. No files changed.\`);`,
    `    const unsupported = found.find(match => ![4, 6].includes(Number(match[1])));\n    if (unsupported)\n      fail(\`Unexpected \${action}@v\${unsupported[1]} in \${rel}; inspect manually. No files changed.\`);`,
    runtimeCheckRel);
  return result;
}
function checkPrerequisites() {
  const required = [...current, runnerRel, 'pnpm-lock.yaml', 'apps/api/prisma/migrations',
    'apps/api/tests/integration/authorization-ownership.integration.test.ts',
    'apps/api/tests/integration/checkout-transaction.integration.test.ts'];
  for (const rel of required) if (!fs.existsSync(getFile(rel))) fail(`Missing ${rel}. Extract at CommerceLab repository root.`);
  if (fs.existsSync(getFile('.github/workflows/ec014-quality.yml')))
    fail('Legacy duplicate workflow still exists. Resolve EC-015.5 first.');
  const y = read(workflowRel);
  if (!y.includes('name: CommerceLab CI') || !y.includes('jobs:\n  quality:'))
    fail('Canonical passing CommerceLab quality workflow not found.');
  if (!y.includes('permissions:\n  contents: read') || !y.includes("EC014_E2E_LIVE: '0'"))
    fail('Quality workflow isolation or permission controls changed; inspect manually.');
  for (const action of ['actions/checkout', 'pnpm/action-setup', 'actions/setup-node', 'actions/upload-artifact'])
    if (!y.includes(`${action}@v6`)) fail(`Expected EC-015.5 Node 24 update (${action}@v6).`);
  return y;
}
function patches() {
  const base = checkPrerequisites();
  const hasJob = /^  postgres-integration:\s*$/m.test(base);
  if (hasJob && !base.includes('node apps/api/scripts/ec015-6-ci-postgres.mjs run'))
    fail('An existing postgres-integration job differs from this EC-015.6 patch; review manually.');
  const workflow = hasJob ? base : base.trimEnd() + '\n' + job;
  const quality = patchQualityVerifier(read(qualityCheckRel));
  const runtime = patchRuntimeVerifier(read(runtimeCheckRel));
  return new Map([[workflowRel, workflow], [qualityCheckRel, quality], [runtimeCheckRel, runtime]]);
}
function validate(result) {
  const y = result.get(workflowRel);
  const j = y.split(/\n  postgres-integration:\s*\n/);
  if (j.length !== 2) fail('There must be exactly one PostgreSQL integration job.');
  for (const item of [
    'image: postgres:17-alpine', "'5433:5432'", 'POSTGRES_USER: commercelab',
    'POSTGRES_DB: postgres', 'pg_isready -U commercelab -d postgres',
    "EC0156_POSTGRES_PASSWORD: 'commerce-ci-ephemeral-only-0156'",
    "POSTGRES_PASSWORD: 'commerce-ci-ephemeral-only-0156'",
    'node apps/api/scripts/ec015-6-ci-postgres.mjs prepare',
    'node apps/api/scripts/ec015-6-ci-postgres.mjs run',
    'pnpm install --frozen-lockfile', 'actions/upload-artifact@v6',
    'if: always()', 'runs-on: ubuntu-latest',
  ]) if (!j[1].includes(item)) fail(`Missing integration job guard: ${item}`);
  if (/migrate\s+reset|prisma\s+db\s+push|prisma\s+db\s+seed/i.test(j[1]))
    fail('Unsafe database operation in integration job.');
  if (!result.get(qualityCheckRel).includes('const qualityOnly = y.split('))
    fail('The original quality verification must be scoped to the quality job.');
  if (!result.get(runtimeCheckRel).includes('if (found.length < 1)') ||
      !result.get(runtimeCheckRel).includes('const unsupported = found.find('))
    fail('Node 24 action-version verification needs to accept two CI jobs.');
  const runner = read(runnerRel);
  for (const item of ['RUNNER_ENVIRONMENT', 'github-hosted', 'CREATE DATABASE',
    'commercelab_authz_test', 'commercelab_checkout_test', '42 passed',
    "['prisma', 'migrate', 'deploy']", 'assertPassedExactly'])
    if (!runner.includes(item)) fail(`Missing required CI PostgreSQL protection: ${item}`);
  console.log('PASS | Existing quality workflow preserved; PostgreSQL job added once');
  console.log('PASS | PostgreSQL 17 ephemeral service on 5433, two isolated test DBs');
  console.log('PASS | Legacy CI and Node 24 validators updated for two-job workflow');
  console.log('INFO | Static checks only: verify GitHub Actions after pushing.');
}
function apply() {
  const result = patches();
  validate(result);
  const changed = [...result].filter(([rel, value]) => read(rel) !== value);
  if (changed.length === 0) {
    console.log('PASS | EC-015.6 already applied (idempotent)');
    return;
  }
  const backupDir = getFile('.reports/ec015-6/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  for (const [rel] of changed) {
    const backup = path.join(backupDir, rel.replaceAll('/', '__') + '.bak');
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, read(rel), { flag: 'wx', mode: 0o600 });
  }
  for (const [rel, value] of changed) {
    fs.writeFileSync(getFile(rel), value);
    console.log(`PASS | Updated ${rel}`);
  }
  console.log('PASS | EC-015.6 patch applied; backups stored in ignored .reports/ec015-6/backups');
}
const mode = process.argv[2];
if (process.argv.length !== 3 || !['apply', 'verify'].includes(mode))
  fail('Usage: node scripts/ec015-6-ci.mjs apply|verify');
if (mode === 'apply') apply();
else {
  const updated = patches();
  validate(updated);
  for (const [rel, value] of updated)
    if (read(rel) !== value) fail(`Incomplete patch in ${rel}; run apply.`);
  console.log('EC-015.6 CI CONFIG VERIFY PASS');
}
