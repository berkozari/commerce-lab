#!/usr/bin/env node
/**
 * EC-015.3: read-only checks of environment configuration and Git exposure.
 * - --templates: CI-safe; does not require real secrets or a running Docker daemon.
 * - --local: checks the existing local Compose/native configs without printing values.
 * Does not rotate credentials, run migrations, or change any repository files.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--templates', '--local'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/ec015-3-env-audit.mjs {--templates|--local}');
  process.exit(2);
}

let failures = 0;
const pass = (message) => console.log(`PASS | ${message}`);
const warn = (message) => console.log(`WARN | ${message}`);
const fail = (message) => { failures++; console.error(`FAIL | ${message}`); };
const read = (name) => readFileSync(join(root, name), 'utf8');
const has = (name) => existsSync(join(root, name));

function parseFile(name) {
  try { return parseEnv(read(name)); }
  catch { fail(`Cannot parse ${name} (contents intentionally withheld)`); return null; }
}
function secretOk(value) {
  return typeof value === 'string' && value.length >= 32 &&
    !/^(?:REPLACE_|CHANGEME|CHANGE_ME|YOUR_|EXAMPLE_|TODO)/i.test(value) &&
    new Set(value).size >= 10;
}
function permissions(name) {
  if (!has(name)) return;
  const modeBits = statSync(join(root, name)).mode & 0o777;
  if ((modeBits & 0o077) !== 0) {
    fail(`${name} is accessible to group/others; run: chmod 600 ${name}`);
  } else pass(`${name} has private file permissions`);
}
function runSafe(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  // Do NOT forward stdout/stderr: Compose config may contain secret values.
  return result;
}
function checkGit() {
  if (!has('.gitignore') || !has('.dockerignore')) {
    fail('Missing .gitignore or .dockerignore'); return;
  }
  const candidateSecrets = ['.env', '.env.local', 'docker/.env', 'docker/.env.full', 'apps/api/.env', 'apps/api/.env.local', 'apps/web/.env.local'];
  const candidateSamples = ['docker/.env.example', 'apps/api/.env.example'];
  for (const path of candidateSecrets) {
    const result = runSafe('git', ['check-ignore', '--no-index', '-q', path]);
    if (result.status !== 0) fail(`Sensitive path not protected by Git ignore rules: ${path}`);
  }
  for (const path of candidateSamples) {
    const result = runSafe('git', ['check-ignore', '--no-index', '-q', path]);
    if (result.status === 0) fail(`Example template unexpectedly ignored by Git: ${path}`);
  }
  const listed = runSafe('git', ['ls-files', '--cached', '-z']);
  if (listed.status !== 0) { fail('Could not inspect Git index'); return; }
  const tracked = listed.stdout.split('\0').filter(Boolean);
  const leaked = tracked.filter(path => /(^|\/)\.env(?:\..*)?$/.test(path) && !path.endsWith('/.env.example') && path !== '.env.example');
  if (leaked.length) fail(`Git index includes ${leaked.length} sensitive environment file(s): ${leaked.join(', ')}`);
  else pass('Git index has no tracked .env secrets');
  const dockerignore = read('.dockerignore');
  const mandatory = ['.env', '.env.*', '**/.env', '**/.env.*'];
  for (const pattern of mandatory) {
    if (!dockerignore.split(/\r?\n/).some(line => line.trim() === pattern)) {
      fail(`Docker build context protection missing .dockerignore pattern: ${pattern}`);
    }
  }
  if (failures === 0) pass('Git ignore and Docker build-context rules checked');
}
function checkTemplates() {
  for (const path of ['docker/.env.example', 'apps/api/.env.example']) {
    if (!has(path)) { fail(`Missing template: ${path}`); continue; }
    const values = parseFile(path);
    if (!values) continue;
    if (path === 'docker/.env.example' && !String(values.COMMERCE_DB_PASSWORD ?? '').startsWith('REPLACE_')) {
      fail(`${path}: expected placeholder for existing or newly provisioned PostgreSQL password`);
    }
    if (path === 'apps/api/.env.example') {
      for (const key of ['DATABASE_URL', 'AUTH_JWT_SECRET', 'AUTH_CSRF_SECRET', 'NODE_ENV', 'HOST', 'PORT', 'CORS_ORIGIN']) {
        if (!values[key]) fail(`${path}: missing ${key}`);
      }
      if (secretOk(values.AUTH_JWT_SECRET) || secretOk(values.AUTH_CSRF_SECRET)) {
        fail(`${path}: auth secrets should be placeholders, not credentials`);
      }
    }
  }
  if (failures === 0) pass('Environment templates are present and contain no usable example credentials');
}
function checkDockerLocal() {
  if (!has('docker/.env') || !has('docker/.env.full')) {
    fail('Expected existing docker/.env and docker/.env.full (run EC-015.2 setup first; never overwrite an existing database password)');
    return;
  }
  permissions('docker/.env');
  permissions('docker/.env.full');
  const dbValues = parseFile('docker/.env');
  const fullValues = parseFile('docker/.env.full');
  if (!dbValues || !fullValues) return;
  if (!dbValues.COMMERCE_DB_PASSWORD || /^REPLACE_/i.test(dbValues.COMMERCE_DB_PASSWORD)) {
    fail('docker/.env: COMMERCE_DB_PASSWORD missing or placeholder');
  }
  for (const key of ['COMMERCE_AUTH_JWT_SECRET', 'COMMERCE_AUTH_CSRF_SECRET']) {
    if (!secretOk(fullValues[key])) fail(`docker/.env.full: ${key} missing, weak, or placeholder`);
  }
  if (fullValues.COMMERCE_AUTH_JWT_SECRET === fullValues.COMMERCE_AUTH_CSRF_SECRET) {
    fail('Docker JWT and CSRF secrets must be distinct');
  }
  let url;
  try { url = new URL(fullValues.COMMERCE_DOCKER_DATABASE_URL); }
  catch { fail('docker/.env.full: invalid COMMERCE_DOCKER_DATABASE_URL'); return; }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== 'postgres' ||
      url.port !== '5432' || url.username !== 'commercelab' || url.pathname !== '/commercelab_dev' ||
      url.search || url.hash || !url.password) {
    fail('Docker database URL does not identify the expected internal development database');
  }
  const compose = runSafe('docker', ['compose', '--env-file', 'docker/.env', '-f', 'docker/compose.dev.yml', 'config', '--format', 'json']);
  if (compose.status !== 0) { fail('Docker Compose config could not be validated (details withheld)'); return; }
  let pg;
  try { pg = JSON.parse(compose.stdout)?.services?.postgres?.environment; }
  catch { fail('Docker Compose JSON configuration invalid'); return; }
  if (pg?.POSTGRES_USER !== 'commercelab' || pg?.POSTGRES_DB !== 'commercelab_dev' || typeof pg?.POSTGRES_PASSWORD !== 'string') {
    fail('Resolved Docker PostgreSQL identity differs from expected development identity'); return;
  }
  // Compose interpolates shell env with higher precedence than --env-file.
  if (pg.POSTGRES_PASSWORD !== dbValues.COMMERCE_DB_PASSWORD) {
    fail('COMMERCE_DB_PASSWORD differs between docker/.env and the resolved Compose config (check exported shell override)');
  }
  if (decodeURIComponent(url.password) !== pg.POSTGRES_PASSWORD) {
    fail('docker/.env.full database credential no longer matches the active Compose credential; do not rotate existing DB password blindly');
  }
  if (failures === 0) pass('Docker credential identity, secret separation, URL, and file permissions verified');
}
function checkNative() {
  if (!has('apps/api/.env')) { warn('apps/api/.env absent: optional if developing exclusively in Docker'); return; }
  permissions('apps/api/.env');
  const cfg = parseFile('apps/api/.env');
  if (!cfg) return;
  if (!secretOk(cfg.AUTH_JWT_SECRET) || !secretOk(cfg.AUTH_CSRF_SECRET) || cfg.AUTH_JWT_SECRET === cfg.AUTH_CSRF_SECRET) {
    fail('apps/api/.env: JWT and CSRF secrets must be distinct, nonplaceholder values with length >= 32');
  }
  let db, cors;
  try { db = new URL(cfg.DATABASE_URL); } catch { fail('apps/api/.env: malformed DATABASE_URL'); }
  try { cors = new URL(cfg.CORS_ORIGIN); } catch { fail('apps/api/.env: malformed CORS_ORIGIN'); }
  if (db && (!['postgres:', 'postgresql:'].includes(db.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname))) {
    fail('Native development DATABASE_URL must target a loopback PostgreSQL host');
  }
  if (cors && (!['http:', 'https:'].includes(cors.protocol) || cors.origin !== cfg.CORS_ORIGIN)) {
    fail('CORS_ORIGIN must be an exact HTTP(S) origin');
  }
  if (cfg.NODE_ENV && cfg.NODE_ENV !== 'development') warn('apps/api/.env NODE_ENV is not development; verify this is intentional');
  if (failures === 0) pass('Native API environment is syntactically valid and secrets are distinct');
}

checkTemplates();
checkGit();
if (mode === '--local') {
  checkDockerLocal();
  checkNative();
}
console.log(failures ? `EC-015.3 ENV AUDIT FAILED (${failures} finding(s))` : 'EC-015.3 ENV AUDIT PASS');
process.exitCode = failures ? 1 : 0;
