#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const at = (...parts) => path.join(root, ...parts);
const imageDir = at("docs", "assets", "screenshots");
const read = (...parts) => readFileSync(at(...parts), "utf8");
const fail = (message) => { throw new Error(message); };
const assert = (ok, message) => { if (!ok) fail(message); };
const START = "<!-- EC-016.3 SHOWCASE START -->";
const END = "<!-- EC-016.3 SHOWCASE END -->";

const images = [
    ["01-home-desktop.png", 1440],
    ["02-catalog-desktop.png", 1440],
    ["03-product-detail-desktop.png", 1440],
    ["04-cart-desktop.png", 1440],
    ["05-checkout-desktop.png", 1440],
    ["06-order-confirmation-desktop.png", 1440],
    ["07-order-history-desktop.png", 1440],
    ["08-catalog-mobile.png", 390],
];

const mandatoryFiles = [
    "README.md",
    "docs/architecture.md",
    "docs/database.md",
    "docs/api.md",
    "docs/showcase.md",
    "apps/web/playwright.showcase.config.ts",
    "apps/web/e2e/showcase.e2e.ts",
    "apps/web/e2e/helpers/mock-api.ts",
    "apps/web/tsconfig.e2e.json",
    "apps/web/vite.config.showcase.ts",
    ".github/workflows/ci.yml",
];

function setup() {
    const file = at("apps", "web", "tsconfig.e2e.json");
    assert(existsSync(file), "apps/web/tsconfig.e2e.json not found");
    const config = JSON.parse(readFileSync(file, "utf8"));
    assert(Array.isArray(config.include), "Unexpected E2E TypeScript include configuration");
    if (!config.include.includes("playwright.showcase.config.ts") || !config.include.includes("vite.config.showcase.ts")) {
        for (const entry of ["playwright.showcase.config.ts", "vite.config.showcase.ts"]) {
            if (!config.include.includes(entry)) config.include.push(entry);
        }
        writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
        console.log("PASS | New showcase Playwright config added to E2E TypeScript checks");
    } else {
        console.log("PASS | E2E TypeScript already includes showcase configuration");
    }
    check();
}

function check() {
    for (const file of mandatoryFiles) assert(existsSync(at(file)), `Missing required file: ${file}`);
    const ts = JSON.parse(read("apps", "web", "tsconfig.e2e.json"));
    assert(ts.include?.includes("playwright.showcase.config.ts") && ts.include.includes("vite.config.showcase.ts"), "Run: node scripts/ec016-3-showcase.mjs setup");
    const captureTest = read("apps", "web", "e2e", "showcase.e2e.ts");
    const config = read("apps", "web", "playwright.showcase.config.ts");
    const doc = read("docs", "showcase.md");
    const vite = read("apps", "web", "vite.config.showcase.ts");
    assert(captureTest.includes('import { mockApi } from "./helpers/mock-api"'), "Showcase must use the existing synthetic API fixture");
    assert(config.includes("127.0.0.1:5191") && config.includes("reuseExistingServer: false"), "Dedicated capture server configuration changed");
    assert(config.includes("/showcase\\.e2e\\.ts$/"), "Showcase test selection changed");
    assert(config.includes("vite.config.showcase.ts") && vite.includes("127.0.0.1:9"), "Showcase API forwarding must stay disabled");
    for (const [name] of images) {
        assert(captureTest.includes(`"${name}"`), `Capture step missing: ${name}`);
        assert(doc.includes(`assets/screenshots/${name}`), `docs/showcase.md does not reference ${name}`);
    }
    assert(!captureTest.includes("EC014_E2E_LIVE"), "Showcase must not invoke the real database browser flow");
    console.log("PASS | Eight named captures, mocked API, dedicated Vite port and documentation references");
    console.log("EC-016.3 SHOWCASE PREFLIGHT PASS");
}

function checkImages() {
    let total = 0;
    for (const [name, expectedWidth] of images) {
        const file = path.join(imageDir, name);
        assert(existsSync(file), `Missing screenshot: ${name}. Run Playwright showcase capture first`);
        const contents = readFileSync(file);
        assert(contents.length > 3_000, `${name}: screenshot too small`);
        assert(contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${name}: not a PNG`);
        const width = contents.readUInt32BE(16);
        const height = contents.readUInt32BE(20);
        assert(width === expectedWidth, `${name}: expected width ${expectedWidth}, got ${width}`);
        assert(height >= 600 && height <= 20000, `${name}: implausible screenshot height ${height}`);
        assert(statSync(file).size < 10_000_000, `${name}: image exceeds 10 MB; optimize before committing`);
        total += contents.length;
        console.log(`PASS | ${name} (${width} x ${height})`);
    }
    assert(total < 30_000_000, "Screenshot collection exceeds 30 MB; optimize before committing");
}

const gallery = `${START}\n## Storefront showcase\n\nScreenshots of the **real React interface**, captured using Playwright with **synthetic mock API data**. No real payments, accounts, or production data are used. [View the complete walkthrough](docs/showcase.md).\n\n| Storefront | Product catalog |\n| --- | --- |\n| ![CommerceLab home](docs/assets/screenshots/01-home-desktop.png) | ![CommerceLab catalog](docs/assets/screenshots/02-catalog-desktop.png) |\n| **Shopping cart** | **Demo order confirmation** |\n| ![CommerceLab cart](docs/assets/screenshots/04-cart-desktop.png) | ![CommerceLab demo order](docs/assets/screenshots/06-order-confirmation-desktop.png) |\n\n${END}`;

function publish() {
    check();
    checkImages();
    const file = at("README.md");
    let markdown = readFileSync(file, "utf8");
    const hasStart = markdown.includes(START);
    const hasEnd = markdown.includes(END);
    assert(hasStart === hasEnd, "README showcase markers are incomplete; inspect manually");
    if (!hasStart) {
        const index = markdown.indexOf("\n## Features\n");
        markdown = index >= 0
            ? `${markdown.slice(0, index).trimEnd()}\n\n${gallery}\n\n${markdown.slice(index + 1)}`
            : `${markdown.trimEnd()}\n\n${gallery}\n`;
    }
    else {
        const existing = markdown.slice(markdown.indexOf(START), markdown.indexOf(END) + END.length);
        assert(existing === gallery, "README showcase section was manually edited; refusing to overwrite it");
    }
    const oldRoadmap = [
        ["- [ ] Final architecture, database, and API documentation refresh (EC-016)", "- [x] Final architecture, database, and API documentation refresh (EC-016)"],
        ["- [ ] Curated screenshots, walkthrough, and portfolio presentation (EC-016)", "- [x] Curated screenshots, walkthrough, and portfolio presentation (EC-016)"],
    ];
    for (const [before, after] of oldRoadmap) markdown = markdown.replace(before, after);
    const note = "Some repository documentation is being updated during EC-016; refer to the current implementation and OpenAPI source for authoritative behavior.";
    markdown = markdown.replace(note, "Refer to the implementation and OpenAPI source for authoritative behavior.");
    const inProgress = "(these documents are being refreshed during EC-016)";
    markdown = markdown.replace(inProgress, "(see also [`docs/api.md`](docs/api.md))");
    if (markdown !== readFileSync(file, "utf8")) {
        writeFileSync(file, markdown);
        console.log("PASS | README gallery and completed EC-016 roadmap published");
    } else console.log("PASS | README gallery already published; no changes");
    verify();
}

function verify() {
    check();
    checkImages();
    const markdown = read("README.md");
    assert(markdown.includes(gallery), "README missing the approved screenshot gallery. Run publish");
    assert(!markdown.includes("- [ ] Final architecture, database, and API documentation refresh (EC-016)"), "README has stale architecture roadmap checkbox");
    assert(!markdown.includes("- [ ] Curated screenshots, walkthrough, and portfolio presentation (EC-016)"), "README has stale showcase roadmap checkbox");
    assert(!markdown.includes("Some repository documentation is being updated during EC-016"), "README has outdated progress statement");
    console.log("PASS | Screenshots, README gallery, showcase guide and completed roadmap are consistent");
    console.log("EC-016.3 SHOWCASE VERIFY PASS");
}

try {
    const command = process.argv[2];
    if (command === "setup") setup();
    else if (command === "check") check();
    else if (command === "publish") publish();
    else if (command === "verify") verify();
    else fail("Usage: node scripts/ec016-3-showcase.mjs setup|check|publish|verify");
} catch (error) {
    console.error(`FAIL | EC-016.3 | ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
