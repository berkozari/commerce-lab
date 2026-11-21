#!/usr/bin/env python3
"""Safely register EC-014.3.5 opt-in catalog test in the isolated DB runner.

Run from the CommerceLab repository root; does not touch any database.
"""
from pathlib import Path
import sys

path = Path("scripts/ec013-10-2-isolated-db-regression.sh")
if not path.is_file():
    sys.exit(f"Missing {path}; run from CommerceLab repo root")
source = path.read_text()
if "tests/integration/catalog-pricing.integration.test.ts" in source:
    sys.exit("Catalog integration suite is already registered; no changes made")

changes = [
    (
        "  run_integration 'Cart merge and rollback' 'tests/integration/cart-merge.integration.test.ts' 5 \"$checkout_url\" EC013_CHECKOUT_TEST_DATABASE_URL || return 1",
        "  run_integration 'Cart merge and rollback' 'tests/integration/cart-merge.integration.test.ts' 5 \"$checkout_url\" EC013_CHECKOUT_TEST_DATABASE_URL || return 1\n"
        "  run_integration 'Catalog prices and visibility' 'tests/integration/catalog-pricing.integration.test.ts' 9 \"$checkout_url\" EC013_CHECKOUT_TEST_DATABASE_URL || return 1",
    ),
    (
        "  printf 'PASS | Cart merge and rollback | 5 passed\\n'",
        "  printf 'PASS | Cart merge and rollback | 5 passed\\n'\n"
        "  printf 'PASS | Catalog prices and visibility | 9 passed\\n'",
    ),
    (
        "EC-013.10.2 + EC-014.3.3 PASS — 33 passed, 0 skipped, 0 failed.",
        "EC-013.10.2 + EC-014.3.3 + EC-014.3.5 PASS — 42 passed, 0 skipped, 0 failed.",
    ),
]
for old, _ in changes:
    if source.count(old) != 1:
        sys.exit(f"Expected one exact occurrence, got {source.count(old)}: {old!r}. No changes made")
for old, new in changes:
    source = source.replace(old, new, 1)
path.write_text(source)
print(f"Updated: {path}")
print("Expected opt-in PostgreSQL tests: 10 + 7 + 11 + 5 + 9 = 42")
