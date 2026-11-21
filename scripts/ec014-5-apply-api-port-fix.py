#!/usr/bin/env python3
"""Guarded, idempotent EC-014.5 Playwright API port-isolation adjustment.

Only modifies the Playwright config and E2E-only tsconfig.  Does not touch
production source, DB env URLs, the regular Vite config, or package files.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
PLAYWRIGHT = ROOT / "apps/web/playwright.config.ts"
TSCONFIG = ROOT / "apps/web/tsconfig.e2e.json"
VITE_E2E = ROOT / "apps/web/vite.config.e2e.ts"

REPLACEMENTS = (
    ('PORT: "3000",', 'PORT: "3187",'),
    (
        'url: "http://127.0.0.1:3000/api/v1/health/ready",',
        'url: "http://127.0.0.1:3187/api/v1/health/ready",',
    ),
    (
        'command: "pnpm --filter @commercelab/web exec vite --host 127.0.0.1 --port 5187 --strictPort",',
        'command: "pnpm --filter @commercelab/web exec vite --config vite.config.e2e.ts --host 127.0.0.1 --port 5187 --strictPort",',
    ),
)


def main() -> None:
    for path in (PLAYWRIGHT, TSCONFIG, VITE_E2E):
        if not path.is_file():
            sys.exit(f"ERROR: Missing {path.relative_to(ROOT)}. Apply ZIP at repository root first.")
    playwright_text = PLAYWRIGHT.read_text(encoding="utf-8")
    for before, after in REPLACEMENTS:
        if playwright_text.count(before) == 1:
            playwright_text = playwright_text.replace(before, after, 1)
        elif playwright_text.count(after) == 1 and playwright_text.count(before) == 0:
            continue  # previously applied
        else:
            sys.exit(f"ERROR: Playwright config anchor not uniquely matched: {before}")

    vite_text = VITE_E2E.read_text(encoding="utf-8")
    if 'target: "http://127.0.0.1:3187"' not in vite_text or 'from "./vite.config"' not in vite_text:
        sys.exit("ERROR: E2E Vite config does not point at isolated API on :3187.")

    config = json.loads(TSCONFIG.read_text(encoding="utf-8"))
    inc = config.get("include")
    if not isinstance(inc, list) or "playwright.config.ts" not in inc:
        sys.exit("ERROR: Unexpected E2E TypeScript include list; refusing to modify.")
    if "vite.config.e2e.ts" not in inc:
        inc.append("vite.config.e2e.ts")

    # All files checked before either existing file is changed.
    PLAYWRIGHT.write_text(playwright_text, encoding="utf-8")
    TSCONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("PASS: Playwright live API isolated to 127.0.0.1:3187")
    print("PASS: E2E-only Vite proxy targets 127.0.0.1:3187")
    print("PASS: E2E TypeScript includes vite.config.e2e.ts")
    print("UNCHANGED: normal Vite config, production source, development DB")


if __name__ == "__main__":
    main()
