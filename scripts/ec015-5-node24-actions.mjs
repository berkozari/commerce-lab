#!/usr/bin/env node
// EC-015.5: targeted Node 24 action-runtime compatibility update.
// Changes only four action major versions in the CI workflow and its local verifier.
// Does not access secrets, alter Git history, install dependencies or touch a database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['.github/workflows/ci.yml', 'scripts/ec015-5-ci.mjs'];
const actions = [
  'actions/checkout',
  'pnpm/action-setup',
  'actions/setup-node',
  'actions/upload-artifact',
];
const mode = process.argv[2];
function fail(message) { console.error(`FAIL | ${message}`); process.exit(1); }
if (!['apply', 'verify'].includes(mode) || process.argv.length !== 3)
  fail('Usage: node scripts/ec015-5-node24-actions.mjs apply|verify');

const changes = [];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fail(`Required file missing: ${rel}`);
  const original = fs.readFileSync(full, 'utf8');
  // The verifier intentionally checks the *legacy* workflow's old @v4 tag.
  // Only modernize its assertCanonical section; leave assertLegacySafe intact.
  const legacyMarker = 'function assertLegacySafe()';
  const cut = rel === 'scripts/ec015-5-ci.mjs' ? original.indexOf(legacyMarker) : original.length;
  if (cut < 0) fail(`Missing legacy checker boundary in ${rel}`);
  let updated = original.slice(0, cut);
  const retained = original.slice(cut);
  for (const action of actions) {
    const re = new RegExp(`${action.replaceAll('/', '\\/')}@v(\\d+)`, 'g');
    const found = [...updated.matchAll(re)];
    if (found.length < 1)
      fail(`Expected at least one ${action} reference in ${rel}; found 0. No files changed.`);
    const unsupported = found.find(match => ![4, 6].includes(Number(match[1])));
    if (unsupported)
      fail(`Unexpected ${action}@v${unsupported[1]} in ${rel}; inspect manually. No files changed.`);
    updated = updated.replace(re, `${action}@v6`);
  }
  changes.push({ rel, full, original, updated: updated + retained });
}

if (mode === 'verify') {
  if (changes.some(({ original, updated }) => original !== updated))
    fail('Some action references are still @v4. Run apply first.');
  console.log('PASS | Four Node.js 24 compatible GitHub Actions versions are synchronized in both files');
  console.log('INFO | GitHub Actions must be re-run after pushing the change.');
} else {
  for (const { full, original, updated, rel } of changes) {
    if (original !== updated) {
      fs.writeFileSync(full, updated);
      console.log(`PASS | Updated ${rel}`);
    } else {
      console.log(`PASS | Already current: ${rel}`);
    }
  }
  console.log('PASS | Node.js 24 action-runtime version update completed; Node.js 22 project test version unchanged');
}
