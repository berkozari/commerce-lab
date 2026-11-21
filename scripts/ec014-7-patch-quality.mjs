#!/usr/bin/env node
/** One-time, fail-closed patch of CommerceLab EC-014 quality scripts. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(root, 'scripts/ec014-6-quality-regression.sh');
const gatePath = path.join(root, 'scripts/ec014-6-coverage-gate.mjs');
const marker = 'EC0147_SOURCE_SCOPE_GUARD';

function fail(message) {
  throw new Error(`EC-014.7 scope patch refused: ${message}`);
}
function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) !== -1) {
    fail(`${label}: expected exactly one original code section; inspect current file rather than applying a blind patch`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

try {
  if (!fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) fail('CommerceLab monorepo root not found');
  if (!fs.existsSync(runnerPath) || !fs.existsSync(gatePath)) fail('original EC-014 scripts missing');
  const oldRunner = fs.readFileSync(runnerPath, 'utf8');
  const oldGate = fs.readFileSync(gatePath, 'utf8');
  const runnerPatched = oldRunner.includes("--coverage.exclude 'src/generated/**'");
  const gatePatched = oldGate.includes(marker);
  if (runnerPatched && gatePatched) {
    console.log('PASS | EC-014.7 source scope fix already present. No files changed.');
    process.exit(0);
  }
  if (runnerPatched !== gatePatched) fail('partial modification detected; inspect both scripts');

  const apiBegin = oldRunner.indexOf("run_check 'API coverage, isolated DB suites excluded'");
  const webBegin = oldRunner.indexOf("run_check 'Web coverage'");
  if (apiBegin < 0 || webBegin <= apiBegin) fail('unexpected quality regression script layout');
  const apiSection = oldRunner.slice(apiBegin, webBegin);
  const needle = "  --coverage.include 'src/**/*.{ts,tsx}' \\\n  --coverage.reporter=text";
  const replacement = "  --coverage.include 'src/**/*.{ts,tsx}' \\\n  --coverage.exclude 'src/generated/**' \\\n  --coverage.exclude 'src/**/*.d.ts' \\\n  --coverage.reporter=text";
  const newApiSection = replaceExactlyOnce(apiSection, needle, replacement, 'API coverage inclusion');
  const newRunner = oldRunner.slice(0, apiBegin) + newApiSection + oldRunner.slice(webBegin);

  const gateNeedle = "  const files = Object.keys(cov).filter(key => key !== 'total').length;\n  if (files === 0) throw new Error(`${suite.name}: no source files in coverage report`);";
  const gateReplacement = `  // ${marker}: generated Prisma code and declaration-only files are not owned application source.
  const sourceFiles = Object.keys(cov).filter(key => key !== 'total');
  const excludedSourceFiles = sourceFiles.filter(key => {
    const normalized = key.replaceAll('\\\\', '/');
    return (suite.name === 'api' && normalized.includes('src/generated/')) || normalized.endsWith('.d.ts');
  });
  if (excludedSourceFiles.length) {
    throw new Error(\`\${suite.name}: excluded source paths unexpectedly in coverage: \${excludedSourceFiles.slice(0, 5).join(', ')}\`);
  }
  const files = sourceFiles.length;
  if (files === 0) throw new Error(\`\${suite.name}: no source files in coverage report\`);`;
  const newGate = replaceExactlyOnce(oldGate, gateNeedle, gateReplacement, 'coverage gate integrity');

  const backupDir = path.resolve(process.env.EC014_REPORT_DIR || path.join(os.homedir(), 'Desktop'), 'ec014-7-script-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backups = [
    [runnerPath, path.join(backupDir, `ec014-6-quality-regression.${stamp}.sh`)],
    [gatePath, path.join(backupDir, `ec014-6-coverage-gate.${stamp}.mjs`)],
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  try {
    fs.writeFileSync(runnerPath, newRunner);
    fs.writeFileSync(gatePath, newGate);
  } catch (error) {
    for (const [source, destination] of backups) fs.copyFileSync(destination, source);
    throw error;
  }
  console.log('PASS | EC-014.7: API coverage excludes src/generated/** and declaration files.');
  console.log('PASS | Gate now rejects accidental inclusion of generated/declaration files.');
  console.log(`Backups: ${backupDir}`);
  console.log('Next: bash scripts/ec014-7-rebaseline.sh');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
