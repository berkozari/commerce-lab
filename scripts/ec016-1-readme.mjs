#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const readmePath = resolve(root, 'README.md');
const draftPath = resolve(root, 'docs/drafts/EC-016-1-README.md');
const backupPath = resolve(root, '.reports/ec016-1/README.before.md');
const auditPath = resolve(root, 'docs/reviews/EC-016-1-documentation-audit.md');
const expectedFiles = [
  'apps/api/docs/openapi/openapi.yaml',
  'apps/api/src/routes/index.ts',
  'apps/web/src/App.tsx',
  'docker/compose.full-dev.yml',
  'scripts/ec015-2-dev-stack.sh',
  'scripts/ec015-4-db.mjs',
  'scripts/ec015-7-infrastructure.mjs',
  'scripts/ec015-8-final.mjs',
];

function assert(condition, message) { if (!condition) throw new Error(message); }
function log(message) { process.stdout.write(`${message}\n`); }
function verify() {
  const data = readFileSync(readmePath, 'utf8');
  for (const marker of ['## Features', '## Getting started (Docker development)', '## Checks and CI', '## Security and project boundaries']) {
    assert(data.includes(marker), `README missing: ${marker}`);
  }
  assert(!data.includes('This is an EC-001 foundation'), 'README remains outdated');
  for (const f of expectedFiles) assert(existsSync(resolve(root, f)), `Expected repository file missing: ${f}`);
  assert(existsSync(auditPath), 'Documentation audit is missing');
  const p = spawnSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8' });
  assert(p.status === 0, `git diff --check failed: ${p.stderr || p.stdout}`);
  log('PASS | README structure, known implementation files, audit and Git whitespace checked');
  log('EC-016.1 README VERIFY PASS');
}
function apply() {
  assert(existsSync(readmePath), 'README.md missing');
  assert(existsSync(draftPath), 'README draft missing: unzip EC-016.1 package first');
  for (const f of expectedFiles) assert(existsSync(resolve(root, f)), `Expected repository file missing: ${f}`);
  const old = readFileSync(readmePath, 'utf8');
  const draft = readFileSync(draftPath, 'utf8');
  if (old === draft) {
    unlinkSync(draftPath);
    log('PASS | README already matches the EC-016.1 draft');
    return verify();
  }
  assert(old.includes('This is an EC-001 foundation') && old.includes('Planned in later milestones'),
    'README has changed from the inspected EC-001 baseline. No overwrite performed; manually compare docs/drafts/EC-016-1-README.md with README.md.');
  assert(!existsSync(backupPath), `Backup already exists (${backupPath}); review before reapplying`);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, old, { flag: 'wx', mode: 0o600 });
  writeFileSync(readmePath, draft);
  unlinkSync(draftPath);
  log('PASS | Replaced outdated README after preserving local backup under .reports/ec016-1');
  verify();
}
try {
  const action = process.argv[2];
  if (action === 'apply') apply();
  else if (action === 'verify') verify();
  else throw new Error('Usage: node scripts/ec016-1-readme.mjs apply|verify');
} catch (error) {
  process.stderr.write(`FAIL | EC-016.1 | ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
