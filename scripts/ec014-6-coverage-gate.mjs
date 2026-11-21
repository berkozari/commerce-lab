#!/usr/bin/env node
/** EC-014.6: report integrity, test-count floors, and baseline coverage ratchet. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'quality', 'ec014-coverage-baseline.json');
const suites = [
  { name: 'api', root: 'apps/api', minPassed: 181 },
  { name: 'web', root: 'apps/web', minPassed: 78 },
];
const metrics = ['statements', 'branches', 'functions', 'lines'];
const tolerance = 1.0; // percentage points: tolerates minor platform differences

function fail(message) { console.error(`FAIL | EC-014.6 quality gate | ${message}`); process.exitCode = 1; }
function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing report: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function assertFinite(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${context}`);
  return value;
}
function collect(suite) {
  const dir = path.join(root, suite.root, 'coverage', 'ec014');
  const cov = readJson(path.join(dir, 'coverage-summary.json'));
  const tests = readJson(path.join(dir, 'vitest-results.json'));
  const summary = cov.total;
  if (!summary || typeof summary !== 'object') throw new Error(`${suite.name}: missing coverage.total`);
  // EC0147_SOURCE_SCOPE_GUARD: generated Prisma code and declaration-only files are not owned application source.
  const sourceFiles = Object.keys(cov).filter(key => key !== 'total');
  const excludedSourceFiles = sourceFiles.filter(key => {
    const normalized = key.replaceAll('\\', '/');
    return (suite.name === 'api' && normalized.includes('src/generated/')) || normalized.endsWith('.d.ts');
  });
  if (excludedSourceFiles.length) {
    throw new Error(`${suite.name}: excluded source paths unexpectedly in coverage: ${excludedSourceFiles.slice(0, 5).join(', ')}`);
  }
  const files = sourceFiles.length;
  if (files === 0) throw new Error(`${suite.name}: no source files in coverage report`);
  const passed = assertFinite(tests.numPassedTests, `${suite.name} passing test count`);
  const failed = assertFinite(tests.numFailedTests, `${suite.name} failing test count`);
  const pending = assertFinite(tests.numPendingTests, `${suite.name} skipped/pending test count`);
  if (failed !== 0 || pending !== 0 || passed < suite.minPassed) {
    throw new Error(`${suite.name}: expected >=${suite.minPassed} passed, 0 failed/skipped; actual ${passed} passed, ${failed} failed, ${pending} skipped`);
  }
  const values = {};
  for (const metric of metrics) {
    const raw = summary[metric];
    if (!raw) throw new Error(`${suite.name}: missing ${metric} coverage`);
    const total = assertFinite(raw.total, `${suite.name}.${metric}.total`);
    const covered = assertFinite(raw.covered, `${suite.name}.${metric}.covered`);
    const pct = assertFinite(raw.pct, `${suite.name}.${metric}.pct`);
    if (total <= 0 || covered < 0 || covered > total || pct < 0 || pct > 100) {
      throw new Error(`${suite.name}: invalid ${metric} measurement`);
    }
    values[metric] = { pct, total };
  }
  console.log(`MEASURED | ${suite.name}: ${passed} tests, ${files} covered-source files | ${metrics.map(m => `${m} ${values[m].pct}%`).join(' | ')}`);
  return { minPassed: suite.minPassed, files, metrics: values };
}

const mode = process.argv[2];
if (!['--bootstrap', '--check'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/ec014-6-coverage-gate.mjs --bootstrap|--check');
  process.exit(2);
}
try {
  const actual = Object.fromEntries(suites.map(suite => [suite.name, collect(suite)]));
  if (mode === '--bootstrap') {
    if (fs.existsSync(baselinePath)) throw new Error('Baseline already exists. Refusing to overwrite; use --check or review a deliberate baseline update.');
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify({ schemaVersion: 1, coverageTolerancePp: tolerance, suites: actual }, null, 2) + '\n', { flag: 'wx' });
    console.log(`PASS | First baseline created: ${path.relative(root, baselinePath)}. Keep this file in Git after EC-014 approval.`);
  } else {
    const baseline = readJson(baselinePath);
    if (baseline.schemaVersion !== 1 || !baseline.suites) throw new Error('Unsupported coverage baseline format');
    for (const suite of suites) {
      const old = baseline.suites[suite.name];
      const now = actual[suite.name];
      if (!old?.metrics || !Number.isInteger(old.files)) throw new Error(`Baseline missing ${suite.name}`);
      if (now.files < old.files) fail(`${suite.name}: source file count dropped ${old.files} -> ${now.files}; review exclusion/deletions before changing baseline`);
      for (const m of metrics) {
        const target = assertFinite(old.metrics[m]?.pct, `baseline ${suite.name}.${m}.pct`);
        const observed = now.metrics[m].pct;
        if (observed + tolerance < target) fail(`${suite.name}.${m}: coverage fell from ${target}% to ${observed}% (> ${tolerance}pp)`);
      }
    }
    if (!process.exitCode) console.log('PASS | EC-014.6 coverage baseline & minimum test counts maintained.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
