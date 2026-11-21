#!/usr/bin/env node
/**
 * CommerceLab EC-015.4: non-destructive development DB preparation.
 * Scope: existing local Docker Compose project commerce-lab-dev, PostgreSQL
 * database commercelab_dev ONLY. No database reset or schema baselining.
 * No credentials are printed, copied, or written to disk.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
const args = process.argv.slice(3);
const USAGE = 'Usage: node scripts/ec015-4-db.mjs {status|verify|prepare --confirm-dev}';
const migrationPath = join(ROOT, 'apps/api/prisma/migrations');
const expectedNames = [
  'wireless-headphones',
  'desk-lamp',
  'canvas-backpack',
];
const expectedDB = 'commercelab_dev';
const compose = [
  'compose', '-p', 'commerce-lab-dev',
  '--env-file', 'docker/.env',
  '--env-file', 'docker/.env.full',
  '-f', 'docker/compose.dev.yml',
  '-f', 'docker/compose.full-dev.yml',
];

function stop(message) { throw new Error(message); }
function pass(message) { process.stdout.write(`PASS | ${message}\n`); }
function info(message) { process.stdout.write(`INFO | ${message}\n`); }

function run(program, argv, action) {
  const result = spawnSync(program, argv, {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    // Never echo raw subprocess output: Compose can expose interpolated passwords.
    stop(`${action} failed (exit ${result.status ?? 'unknown'}). Review Docker/Prisma locally; do not paste secret-bearing config output.`);
  }
  return result.stdout.trim();
}
function composeRun(tail, action) { return run('docker', [...compose, ...tail], action); }
function sql(query, action) {
  return composeRun([
    'exec', '-T', 'postgres', 'psql',
    '-U', 'commercelab', '-d', expectedDB,
    '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query,
  ], action);
}
function prisma(tail, action) {
  return composeRun([
    'run', '-T', '--rm', '--no-deps', 'api',
    'pnpm', 'exec', 'prisma', ...tail,
  ], action);
}
function fileEnv(path) {
  try { return parseEnv(readFileSync(join(ROOT, path), 'utf8')); }
  catch { stop(`Could not read ${path}; do not replace existing database credentials.`); }
}
function requireFiles() {
  for (const path of [
    'docker/.env', 'docker/.env.full',
    'docker/compose.dev.yml', 'docker/compose.full-dev.yml',
    'apps/api/prisma.config.ts', 'apps/api/prisma/schema.prisma',
    'apps/api/prisma/seed.ts', 'apps/api/prisma/migrations/migration_lock.toml',
  ]) {
    if (!existsSync(join(ROOT, path))) stop(`Required CommerceLab file missing: ${path}`);
  }
}
function assertURL(raw, expectedPassword) {
  let u;
  try { u = new URL(raw); } catch { stop('Invalid private Docker DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
      u.hostname !== 'postgres' || u.port !== '5432' ||
      u.username !== 'commercelab' || u.pathname !== `/${expectedDB}` ||
      u.search || u.hash || !u.password ||
      decodeURIComponent(u.password) !== expectedPassword) {
    stop('Docker API URL does not strictly match the local commercelab_dev PostgreSQL service.');
  }
}
function validateCompose() {
  const base = fileEnv('docker/.env');
  const full = fileEnv('docker/.env.full');
  let cfg;
  try {
    cfg = JSON.parse(composeRun(['config', '--format', 'json'], 'Compose configuration'));
  } catch (error) {
    if (error instanceof SyntaxError) stop('Compose JSON output is invalid.');
    throw error;
  }
  const pg = cfg?.services?.postgres;
  const api = cfg?.services?.api;
  if (cfg?.name !== 'commerce-lab-dev' || !pg || !api ||
      pg.image !== 'postgres:17-alpine' ||
      pg.environment?.POSTGRES_USER !== 'commercelab' ||
      pg.environment?.POSTGRES_DB !== expectedDB ||
      !base.COMMERCE_DB_PASSWORD ||
      pg.environment?.POSTGRES_PASSWORD !== base.COMMERCE_DB_PASSWORD) {
    stop('Docker Compose identity or effective PostgreSQL password differs from the approved development setup.');
  }
  const port = pg.ports?.some(p => p.host_ip === '127.0.0.1' &&
    Number(p.published) === 5433 && Number(p.target) === 5432 && p.protocol === 'tcp');
  const volume = pg.volumes?.some(v => v.type === 'volume' && v.target === '/var/lib/postgresql/data');
  if (!port || !volume) stop('Local Docker PostgreSQL port/volume definition does not match CommerceLab development setup.');
  if (api.environment?.NODE_ENV !== 'development') {
    stop('Docker API NODE_ENV must be development.');
  }
  if (full.COMMERCE_DOCKER_DATABASE_URL !== api.environment?.DATABASE_URL) {
    stop('The effective Docker API DATABASE_URL differs from docker/.env.full.');
  }
  assertURL(api.environment.DATABASE_URL, pg.environment.POSTGRES_PASSWORD);
  pass('Local Docker Compose PostgreSQL identity, credentials, volume and API target validated (secrets hidden)');
}
function verifyDocker() {
  const containerId = composeRun(['ps', '-q', 'postgres'], 'PostgreSQL container lookup');
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    stop('PostgreSQL container is not running. Start the existing PostgreSQL-only Compose service first.');
  }
  const state = run('docker', ['inspect', '--format', '{{.State.Health.Status}}', containerId], 'PostgreSQL health check');
  if (state !== 'healthy') stop(`PostgreSQL is not healthy (state: ${state}).`);
  const identity = sql("SELECT current_database() || '|' || current_user", 'SQL database identity');
  if (identity !== `${expectedDB}|commercelab`) stop('SQL session is not connected as commercelab to commercelab_dev.');
  pass('Healthy PostgreSQL; SQL confirms exact development database and role');
}
function localMigrationNames() {
  const names = readdirSync(migrationPath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(d.name))
    .map(d => d.name).sort();
  if (names.length === 0 || !names.some(n => n.endsWith('_baseline_schema'))) {
    stop('Expected versioned Prisma migrations/baseline are missing.');
  }
  for (const name of names) {
    if (!existsSync(join(migrationPath, name, 'migration.sql'))) {
      stop(`Missing migration.sql for ${name}.`);
    }
  }
  return names;
}
function inspectMigrations(names) {
  const flags = sql(
    `SELECT (to_regclass('public."_prisma_migrations"') IS NOT NULL)::int || '|' || (to_regclass('public."User"') IS NOT NULL)::int`,
    'Prisma migration table lookup',
  );
  if (!['0|0', '0|1', '1|0', '1|1'].includes(flags)) stop('Unexpected PostgreSQL migration table identity.');
  const [historyExists, userExists] = flags.split('|').map(x => x === '1');
  if (userExists && !historyExists) {
    stop('Existing schema has no Prisma migration history. Do not apply baseline automatically; investigate the migration state.');
  }
  if (!userExists && historyExists) {
    stop('Prisma migration table exists but User table is missing; inspect schema before proceeding.');
  }
  const applied = new Set();
  if (historyExists) {
    const rows = sql(
      `SELECT migration_name || '|' || CASE WHEN finished_at IS NOT NULL THEN 'done' WHEN rolled_back_at IS NOT NULL THEN 'rolledback' ELSE 'failed' END FROM public."_prisma_migrations" ORDER BY started_at`,
      'Prisma migration history query',
    );
    for (const line of rows.split(/\r?\n/).filter(Boolean)) {
      const [name, state, ...unexpected] = line.split('|');
      if (unexpected.length || !names.includes(name) || !['done', 'rolledback', 'failed'].includes(state)) {
        stop('Unrecognized Prisma migration history detected; do not auto-repair.');
      }
      if (state === 'failed') stop(`Unresolved migration detected: ${name}. Manual review required.`);
      if (state === 'done') applied.add(name);
    }
    if (userExists && ![...applied].some(n => n.endsWith('_baseline_schema'))) {
      stop('Existing schema is missing an applied baseline migration. Do not auto-baseline.');
    }
  }
  const pending = names.filter(name => !applied.has(name));
  info(`Prisma migrations: ${applied.size} applied, ${pending.length} pending`);
  if (pending.length) info(`Pending: ${pending.join(', ')}`);
  return { applied, pending, userExists };
}
function seedCount() {
  const count = sql(`SELECT COUNT(DISTINCT p."slug") FROM "Product" p
    JOIN "ProductVariant" v ON v."productId" = p."id"
    JOIN "Inventory" i ON i."variantId" = v."id"
    WHERE (p."slug" = 'wireless-headphones' AND v."sku" = 'EL-HEAD-001')
       OR (p."slug" = 'desk-lamp' AND v."sku" = 'HM-LAMP-001')
       OR (p."slug" = 'canvas-backpack' AND v."sku" = 'AC-BAG-001')`,
  'Read-only seed inventory check');
  const n = Number(count);
  if (!Number.isInteger(n) || n < 0 || n > expectedNames.length) stop('Unexpected seed verification result.');
  return n;
}
function migrationStatus() {
  prisma(['migrate', 'status'], 'Prisma migrate status');
  pass('Prisma migrate status reports matching migration history');
}
function verify(names) {
  const state = inspectMigrations(names);
  if (state.pending.length) stop('Migration status is not current. Run prepare with explicit confirmation only after reviewing pending SQL.');
  migrationStatus();
  const seeded = seedCount();
  if (seeded !== expectedNames.length) stop(`Demo catalog not fully seeded (${seeded}/${expectedNames.length}).`);
  pass(`${seeded}/${expectedNames.length} expected demo products, variants and inventory records are present`);
  pass('EC-015.4 DATABASE VERIFY PASS');
}

try {
  if (!['status', 'verify', 'prepare'].includes(command) ||
      (command !== 'prepare' && args.length !== 0) ||
      (command === 'prepare' && (args.length !== 1 || args[0] !== '--confirm-dev'))) {
    stop(USAGE);
  }
  requireFiles();
  validateCompose();
  verifyDocker();
  const names = localMigrationNames();

  if (command === 'status') {
    const state = inspectMigrations(names);
    if (!state.pending.length) {
      migrationStatus();
      const seeded = seedCount();
      info(`Demo catalog seed: ${seeded}/${expectedNames.length} items present`);
    } else {
      info('Migration files need explicit review and deployment; no changes made.');
    }
    if (state.pending.length) {
      info('EC-015.4 STATUS: PENDING MIGRATIONS — read-only guard completed; database is not ready');
    } else {
      pass('EC-015.4 READ-ONLY STATUS PASS');
    }
  } else if (command === 'verify') {
    verify(names);
  } else {
    const branch = run('git', ['branch', '--show-current'], 'Git branch lookup');
    if (!branch.startsWith('feature/')) stop('Database prepare is only allowed from a feature/* development branch.');
    info('Explicit target: LOCAL commercelab_dev. migrate deploy may alter tables; seed may update demo catalog metadata.');
    info('No migrate reset, db push, database creation/deletion, or test database access will be performed.');
    const state = inspectMigrations(names);
    if (state.pending.length) {
      info('Applying pending versioned migrations (no resets or auto-baselining)...');
      prisma(['migrate', 'deploy'], 'Prisma migrate deploy');
      pass('Prisma migrations deployed to local development database');
    } else {
      info('No pending migrations; skipping migrate deploy');
    }
    const after = inspectMigrations(names);
    if (after.pending.length) stop('Some migrations remain pending after deploy.');
    migrationStatus();
    const seeded = seedCount();
    if (seeded < expectedNames.length) {
      info(`Seeding demo catalog (${seeded}/${expectedNames.length} present beforehand)...`);
      prisma(['db', 'seed'], 'Prisma db seed');
      pass('Demo catalog seed completed (existing inventory quantities are not overwritten by seed.ts)');
    } else {
      info('Demo catalog already seeded; skipping seed to preserve existing data');
    }
    verify(names);
    pass('EC-015.4 DEVELOPMENT DATABASE PREPARE PASS');
  }
} catch (error) {
  console.error(`FAIL | ${error instanceof Error ? error.message : 'Unknown database preparation error'}`);
  process.exitCode = 1;
}
