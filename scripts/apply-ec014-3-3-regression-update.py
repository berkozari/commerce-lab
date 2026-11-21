#!/usr/bin/env python3
"""Safely add the new isolated cart-merge suite to the existing regression runner."""
from pathlib import Path
import sys

path = Path("scripts/ec013-10-2-isolated-db-regression.sh")
if not path.is_file():
    sys.exit(f"Missing {path}. Run this from the CommerceLab repository root.")
source = path.read_text()
marker = "tests/integration/cart-merge.integration.test.ts"
if marker in source:
    sys.exit("Cart merge suite is already registered; no files changed.")

old_run = "  run_integration 'Payment and cancellation' 'tests/integration/order-payment-cancellation.integration.test.ts' 11 \"$checkout_url\" EC013_CHECKOUT_TEST_DATABASE_URL || return 1"
new_run = old_run + "\n  run_integration 'Cart merge and rollback' 'tests/integration/cart-merge.integration.test.ts' 5 \"$checkout_url\" EC013_CHECKOUT_TEST_DATABASE_URL || return 1"
old_summary = "  printf 'PASS | Payment & cancellation | 11 passed\\n'"
new_summary = old_summary + "\n  printf 'PASS | Cart merge and rollback | 5 passed\\n'"
old_total = "EC-013.10.2 PASS — 28 passed, 0 skipped, 0 failed."
new_total = "EC-013.10.2 + EC-014.3.3 PASS — 33 passed, 0 skipped, 0 failed."

checks = [(old_run, new_run), (old_summary, new_summary), (old_total, new_total)]
for old, _ in checks:
    if source.count(old) != 1:
        sys.exit(f"Expected one exact match for {old!r}; found {source.count(old)}. No changes made.")
for old, new in checks:
    source = source.replace(old, new, 1)
path.write_text(source)
print(f"Updated: {path}")
print("Integration suites: authorization(10) + checkout(7) + payment(11) + cart merge(5) = 33")
