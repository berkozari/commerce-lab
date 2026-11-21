#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts) => join(root, ...parts);
const read = (...parts) => readFileSync(at(...parts), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const fail = (message) => { throw new Error(`EC-016.2 | ${message}`); };
const target = {
  architecture: at("docs", "architecture.md"),
  database: at("docs", "database.md"),
  api: at("docs", "api.md"),
};
const draft = (key) => at("docs", "_ec0162_drafts", `${key}.md`);
const openApiFile = at("apps", "api", "docs", "openapi", "openapi.yaml");
const databaseBaselineHash = "94052a61efb425ae56f575be8248621f02d509f5f17b5977c9064d1636d0b94f";

const oldPublicSort = "- { name: sort, in: query, schema: { type: string, enum: [newest, oldest, name-asc, name-desc] } }";
const newPublicSort = [
  "- { name: minPrice, in: query, schema: { type: string, pattern: '^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$' } }",
  "- { name: maxPrice, in: query, schema: { type: string, pattern: '^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$' } }",
  "- { name: sort, in: query, schema: { type: string, enum: [newest, oldest, name-asc, name-desc, price-asc, price-desc] } }",
].join("\n        ");

const oldAdminStatus = "- { name: status, in: query, schema: { type: string, enum: [DRAFT, ACTIVE, ARCHIVED] } }";
const newAdminStatus = [
  "- { name: q, in: query, schema: { type: string } }",
  "- { name: categoryId, in: query, schema: { type: string, format: uuid } }",
  "- { name: minPrice, in: query, schema: { type: string, pattern: '^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$' } }",
  "- { name: maxPrice, in: query, schema: { type: string, pattern: '^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$' } }",
  "- { name: sort, in: query, schema: { type: string, enum: [newest, oldest, name-asc, name-desc, price-asc, price-desc] } }",
  "- { name: status, in: query, schema: { type: string, enum: [DRAFT, ACTIVE, ARCHIVED] } }",
].join("\n        ");

function exactlyOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (text.split(oldValue).length !== 2) fail(`${label}: expected one known source fragment; OpenAPI changed. Review manually.`);
  return text.replace(oldValue, () => newValue);
}

function updatedOpenApi(source) {
  let text = exactlyOnce(source, oldPublicSort, newPublicSort, "public product filters");
  text = exactlyOnce(text, oldAdminStatus, newAdminStatus, "admin product filters");
  text = exactlyOnce(text, "New unpaid order created; stock reserved and cart cleared", "New unpaid order created; stock decremented and cart cleared", "checkout description");
  return text;
}

function parseOpenApiMethods(spec) {
  const operations = new Set();
  let inPaths = false;
  let path = null;
  for (const line of spec.split(/\r?\n/)) {
    if (line === "paths:") { inPaths = true; continue; }
    if (inPaths && /^\S/.test(line) && line.trim()) { inPaths = false; path = null; }
    if (!inPaths) continue;
    const heading = /^ {2}(\/[^:]+):\s*$/.exec(line);
    if (heading) { path = heading[1]; continue; }
    const operation = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (path && operation) operations.add(`${operation[1].toUpperCase()} ${path}`);
  }
  return operations;
}

function parseExpressMethods() {
  const index = read("apps", "api", "src", "routes", "index.ts");
  const mounts = new Map();
  const mountRegex = /apiRouter\.use\((?:"([^"]+)"\s*,\s*)?(\w+)\);/g;
  for (const match of index.matchAll(mountRegex)) mounts.set(match[2], match[1] ?? "");
  if (mounts.size < 6) fail("unexpected API router mount layout; recheck route extraction");
  const operations = new Set();
  const routesDir = at("apps", "api", "src", "routes");
  for (const entry of readdirSync(routesDir).filter((x) => x.endsWith(".routes.ts"))) {
    const body = readFileSync(join(routesDir, entry), "utf8");
    for (const match of body.matchAll(/\b(\w+Router)\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      const [, name, method, relative] = match;
      if (!mounts.has(name)) fail(`router ${name} is not mounted; update extractor`);
      const prefix = mounts.get(name);
      const fullPath = `${prefix}/${relative}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
      const normalized = fullPath.replace(/:([A-Za-z_]\w*)/g, "{$1}");
      operations.add(`${method.toUpperCase()} ${normalized}`);
    }
  }
  return operations;
}

function verify() {
  for (const [key, file] of Object.entries(target)) {
    if (!existsSync(file)) fail(`docs/${key}.md missing`);
    const text = readFileSync(file, "utf8");
    if (!text.startsWith(`# CommerceLab — ${key === "architecture" ? "System Architecture" : key === "database" ? "Database Design" : "API Contract and Documentation"}`)) fail(`docs/${key}.md heading mismatch`);
    if (!text.includes("```mermaid") && key !== "api") fail(`docs/${key}.md needs a Mermaid diagram`);
  }
  const schema = read("apps", "api", "prisma", "schema.prisma");
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  const dbDoc = readFileSync(target.database, "utf8");
  for (const model of models) if (!dbDoc.includes(`\`${model}\``)) fail(`Prisma model ${model} not documented`);
  const migrations = readdirSync(at("apps", "api", "prisma", "migrations")).filter((entry) => existsSync(at("apps", "api", "prisma", "migrations", entry, "migration.sql")));
  for (const migration of migrations) if (!dbDoc.includes(`\`${migration}\``)) fail(`migration ${migration} not documented`);
  if (migrations.length !== 7) fail(`expected reviewed baseline of 7 migration folders, got ${migrations.length}; update the guide`);
  const spec = readFileSync(openApiFile, "utf8");
  if (!spec.includes("enum: [newest, oldest, name-asc, name-desc, price-asc, price-desc]")) fail("OpenAPI missing catalog price sort options");
  if (!spec.includes("name: minPrice") || !spec.includes("name: maxPrice")) fail("OpenAPI missing price filters");
  if (!spec.includes("stock decremented and cart cleared")) fail("outdated OpenAPI stock wording");
  const fromApi = parseOpenApiMethods(spec);
  const fromRoutes = parseExpressMethods();
  const missing = [...fromRoutes].filter((x) => !fromApi.has(x)).sort();
  const extra = [...fromApi].filter((x) => !fromRoutes.has(x)).sort();
  if (missing.length || extra.length) fail(`OpenAPI route parity mismatch\n  Missing: ${missing.join(", ") || "none"}\n  Extra: ${extra.join(", ") || "none"}`);
  console.log(`PASS | ${models.length} Prisma models, ${migrations.length} migrations documented`);
  console.log(`PASS | OpenAPI covers ${fromApi.size} HTTP method/path operations`);
  console.log("PASS | Catalog filters/sorts and checkout stock semantics reviewed");
  console.log("EC-016.2 DOCUMENTATION VERIFY PASS");
}

function apply() {
  const ready = Object.entries(target).every(([key, path]) => existsSync(path) && readFileSync(path, "utf8").startsWith(`# CommerceLab — ${key === "architecture" ? "System Architecture" : key === "database" ? "Database Design" : "API Contract and Documentation"}`));
  if (ready) { console.log("INFO | EC-016.2 documents already installed; verifying"); verify(); return; }
  if (!existsSync(draft("architecture")) || !existsSync(draft("database")) || !existsSync(draft("api"))) fail("missing package draft files; unzip the ZIP into repository root first");
  if (existsSync(target.architecture) && readFileSync(target.architecture, "utf8").trim() !== "") fail("docs/architecture.md is not empty; refusing to overwrite non-baseline documentation");
  if (existsSync(target.api)) fail("docs/api.md already exists; refusing to overwrite it");
  if (!existsSync(target.database) || sha(readFileSync(target.database, "utf8")) !== databaseBaselineHash) fail("docs/database.md differs from reviewed baseline; refusing to overwrite it");
  const spec = readFileSync(openApiFile, "utf8");
  const revisedSpec = updatedOpenApi(spec);
  // All preconditions pass before writing documentation or the specification.
  for (const key of Object.keys(target)) renameSync(draft(key), target[key]);
  writeFileSync(openApiFile, revisedSpec);
  rmSync(at("docs", "_ec0162_drafts"), { recursive: true, force: true });
  console.log("PASS | Architecture, database and API guides installed; OpenAPI catalog details updated");
  verify();
}

try {
  const action = process.argv[2];
  if (action === "apply") apply();
  else if (action === "verify") verify();
  else fail("usage: node scripts/ec016-2-docs.mjs apply|verify");
} catch (error) {
  console.error(`FAIL | ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
