#!/usr/bin/env node
// EC-015.6: provision and run exactly 42 existing real-PostgreSQL tests on an
// ephemeral GitHub-hosted runner. Deliberately refuses local/self-hosted runs.
// No prisma migrate reset, db push, seed or data-volume operations.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import pg from 'pg';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(apiRoot, '../..');
const reportDir = path.join(root, '.reports/ec015-6');
const password = process.env.EC0156_POSTGRES_PASSWORD ?? '';
const host = '127.0.0.1';
const port = 5433;
const user = 'commercelab';
const databaseNames = ['commercelab_authz_test', 'commercelab_checkout_test'];
const tests = [
  { label: 'authorization-ownership', file: 'authorization-ownership.integration.test.ts', count: 10, db: databaseNames[0], envName: 'EC013_AUTHZ_TEST_DATABASE_URL' },
  { label: 'checkout-transaction', file: 'checkout-transaction.integration.test.ts', count: 7, db: databaseNames[1], envName: 'EC013_CHECKOUT_TEST_DATABASE_URL' },
  { label: 'order-payment-cancellation', file: 'order-payment-cancellation.integration.test.ts', count: 11, db: databaseNames[1], envName: 'EC013_CHECKOUT_TEST_DATABASE_URL' },
  { label: 'cart-merge', file: 'cart-merge.integration.test.ts', count: 5, db: databaseNames[1], envName: 'EC013_CHECKOUT_TEST_DATABASE_URL' },
  { label: 'catalog-pricing', file: 'catalog-pricing.integration.test.ts', count: 9, db: databaseNames[1], envName: 'EC013_CHECKOUT_TEST_DATABASE_URL' },
];

function fail(message) { throw new Error(message); }
function assertRunner() {
  const e = process.env;
  if (e.GITHUB_ACTIONS !== 'true' || e.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      e.RUNNER_OS !== 'Linux' || e.CI !== 'true' || !/^\d+$/.test(e.GITHUB_RUN_ID ?? '')) {
    fail('Refusing PostgreSQL operations outside an ephemeral GitHub-hosted Linux CI runner.');
  }
  if (e.DATABASE_URL || e.EC013_AUTHZ_TEST_DATABASE_URL || e.EC013_CHECKOUT_TEST_DATABASE_URL)
    fail('Ambient database URL detected; refusing to run against an inherited database target.');
  if (password !== 'commerce-ci-ephemeral-only-0156')
    fail('Unexpected CI-only service password. Check workflow service and job configuration.');
  for (const rel of ['pnpm-lock.yaml', 'apps/api/prisma.config.ts', 'apps/api/prisma/migrations']) {
    if (!fs.existsSync(path.join(root, rel))) fail(`Not a complete CommerceLab checkout: ${rel}`);
  }
}
function createUrl(db) {
  if (db !== 'postgres' && !databaseNames.includes(db)) fail('Invalid target database.');
  const url = new URL('postgresql://127.0.0.1:5433');
  url.username = user;
  url.password = password;
  url.pathname = `/${db}`;
  return url.toString();
}
function redact(value) {
  if (!password) return String(value);
  return String(value)
    .replaceAll(createUrl('postgres'), '[CI-POSTGRES-URL]')
    .replaceAll(password, '[REDACTED]')
    .replaceAll(encodeURIComponent(password), '[REDACTED]');
}
function report(name, value) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, name), redact(value), { mode: 0o600 });
}
function command(label, args, database, envVars = {}, file) {
  const env = { ...process.env, ...envVars, DATABASE_URL: createUrl(database), NODE_ENV: 'test', CI: 'true' };
  // The only Prisma/Vitest URLs available to this child belong to the two CI DBs.
  delete env.EC013_AUTHZ_TEST_DATABASE_URL;
  delete env.EC013_CHECKOUT_TEST_DATABASE_URL;
  Object.assign(env, envVars);
  const result = spawnSync('pnpm', ['--filter', '@commercelab/api', 'exec', ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 20 * 1024 * 1024,
  });
  const combined = redact(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (file) report(file, combined);
  console.log(`=== ${label} ===`);
  console.log(combined.trimEnd().slice(-12000));
  if (result.error) fail(`${label}: process could not complete (${result.error.code ?? result.error.name}).`);
  if (result.status !== 0) fail(`${label}: command failed (exit ${result.status ?? 'signal'}).`);
  return combined;
}
async function connect(db) {
  const client = new pg.Client({ host, port, user, password, database: db, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}
async function checkService(db = 'postgres') {
  const client = await connect(db);
  try {
    const result = await client.query('SELECT current_database() AS db_name, current_user AS user_name, inet_server_port() AS server_port, current_setting(\'server_version_num\') AS version');
    const row = result.rows[0];
    if (row?.db_name !== db || row?.user_name !== user || row?.server_port !== 5432 ||
        !(Number(row?.version) >= 170000 && Number(row?.version) < 180000)) {
      fail(`Unexpected PostgreSQL identity for ${db}. Refusing database changes.`);
    }
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}
async function verifyDatabaseList(expected) {
  const client = await checkService();
  try {
    const result = await client.query('SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) ORDER BY datname', [databaseNames]);
    const actual = result.rows.map((r) => r.datname).sort();
    if (actual.join(',') !== [...expected].sort().join(','))
      fail(`CI test database set differs from expected (${actual.length} existing, expected ${expected.length}).`);
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}
async function prepare() {
  const client = await verifyDatabaseList([]);
  try {
    // The following SQL identifiers are constants, never environment-derived.
    for (const db of databaseNames) {
      await client.query(`CREATE DATABASE "${db}"`);
      console.log(`PASS | Created disposable CI-only database ${db}`);
    }
  } finally { await client.end(); }
  for (const db of databaseNames) {
    const verifyClient = await checkService(db);
    await verifyClient.end();
    command(`Prisma migrate deploy — ${db}`, ['prisma', 'migrate', 'deploy'], db, {}, `migrate-${db}.log`);
    const status = command(`Prisma migrate status — ${db}`, ['prisma', 'migrate', 'status'], db, {}, `status-${db}.log`);
    if (!status.includes('Database schema is up to date!')) fail(`${db}: Prisma does not report an up-to-date schema.`);
    console.log(`PASS | ${db}: migration history up to date`);
  }
  report('prepare-summary.txt', 'EC-015.6 CI-only PostgreSQL setup: 2 isolated databases migrated.\n');
  console.log('EC-015.6 CI DATABASE PREPARE PASS');
}
function assertPassedExactly(output, count) {
  const lines = stripVTControlCharacters(output).split(/\r?\n/);
  const testsLine = lines.find((line) => /^\s*Tests\s+/.test(line));
  const filesLine = lines.find((line) => /^\s*Test Files\s+/.test(line));
  if (!testsLine || !new RegExp(`\\b${count} passed\\b`).test(testsLine) ||
      /\b(?:failed|skipped|todo|pending)\b/.test(testsLine) ||
      !filesLine || !/\b1 passed\b/.test(filesLine) || /\b(?:failed|skipped)\b/.test(filesLine)) {
    fail(`Unexpected test count; expected ${count} passed, 0 skipped. Summary: ${testsLine ?? 'missing'}`);
  }
}
async function runTests() {
  const c = await verifyDatabaseList(databaseNames);
  await c.end();
  for (const db of databaseNames) {
    const verified = await checkService(db);
    await verified.end();
    const status = command(`Verify migrations — ${db}`, ['prisma', 'migrate', 'status'], db);
    if (!status.includes('Database schema is up to date!')) fail(`${db}: migrate status not current.`);
  }
  let total = 0;
  const summary = [];
  for (const test of tests) {
    const output = command(test.label,
      ['vitest', 'run', `tests/integration/${test.file}`], test.db,
      { [test.envName]: createUrl(test.db) }, `${test.label}.log`);
    assertPassedExactly(output, test.count);
    total += test.count;
    summary.push(`PASS | ${test.label} | ${test.count} passed, 0 skipped`);
    console.log(summary.at(-1));
  }
  if (total !== 42) fail(`Unexpected aggregate integration test count: ${total}`);
  const message = `${summary.join('\n')}\nEC-015.6 POSTGRESQL CI INTEGRATION PASS — 42 passed, 0 skipped, 0 failed.\n`;
  report('test-summary.txt', message);
  console.log(message);
}

const mode = process.argv[2];
if (process.argv.length !== 3 || !['prepare', 'run'].includes(mode)) {
  console.error('Usage: node apps/api/scripts/ec015-6-ci-postgres.mjs prepare|run');
  process.exit(2);
}
try {
  assertRunner();
  if (mode === 'prepare') await prepare(); else await runTests();
} catch (error) {
  const detail = redact(error instanceof Error ? error.message : String(error));
  console.error(`FAIL | EC-015.6 | ${detail}`);
  try { report('failure.txt', `EC-015.6 FAILED: ${detail}\n`); } catch { /* reports are best-effort */ }
  process.exitCode = 1;
}
