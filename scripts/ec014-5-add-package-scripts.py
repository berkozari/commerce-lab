#!/usr/bin/env python3
"""Add E2E scripts to Web package.json, preserving other packages/settings."""
import json
from pathlib import Path

path = Path('apps/web/package.json')
if not path.is_file():
    raise SystemExit('Run from CommerceLab root (apps/web/package.json missing)')
data = json.loads(path.read_text())
scripts = data.setdefault('scripts', {})
for name, command in {
    'test:e2e': 'playwright test -c playwright.config.ts',
    'typecheck:e2e': 'tsc --noEmit -p tsconfig.e2e.json',
}.items():
    if name in scripts and scripts[name] != command:
        raise SystemExit(f'Conflicting existing script {name}: {scripts[name]}')
    scripts[name] = command
path.write_text(json.dumps(data, ensure_ascii=False, indent=4) + '\n')
print('Updated apps/web/package.json E2E scripts.')
