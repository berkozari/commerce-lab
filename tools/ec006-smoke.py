#!/usr/bin/env python3
"""EC-006 local smoke test; stdlib only, no credential/token logging.

Requires a published ACTIVE variant with >=3 available units and a CUSTOMER login.
Uses a guest cart, logs in, then explicitly merges and cleans up only its own added line.
For a dedicated local test account/cart; do not use a real account with important cart items.
"""
import getpass
import json
import os
import sys
import uuid
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = os.environ.get("COMMERCE_API", "http://localhost:3000/api/v1")


def client():
    return build_opener(HTTPCookieProcessor(CookieJar()))


def call(opener, method, path, data=None, csrf=None):
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if csrf:
        headers["x-csrf-token"] = csrf
    payload = json.dumps(data).encode() if data is not None else None
    request = Request(BASE + path, data=payload, headers=headers, method=method)
    try:
        response = opener.open(request, timeout=12)
    except HTTPError as error:
        response = error
    body = response.read().decode()
    try:
        body_json = json.loads(body)
    except json.JSONDecodeError:
        body_json = {"raw": body[:200]}
    return response.status, body_json


def ensure(status, expected, title):
    if status != expected:
        raise AssertionError(f"{title}: expected HTTP {expected}; got HTTP {status}")
    print(f"PASS | {title}: HTTP {status}")


def main():
    print("Use a local throwaway CUSTOMER account with an empty cart; a successful test clears this cart.")
    variant = input("ACTIVE variant UUID (stock >= 3): ").strip()
    uuid.UUID(variant)
    email = input("Local CUSTOMER email: ").strip()
    password = getpass.getpass("Local CUSTOMER password: ")
    guest = client()
    user = guest  # same browser preserves the guest cookie through login
    status, body = call(guest, "GET", "/auth/csrf")
    ensure(status, 200, "CSRF issue")
    csrf = body["data"]["csrfToken"]

    status, body = call(guest, "GET", "/cart")
    ensure(status, 200, "Guest cart initialized")
    status, body = call(guest, "POST", "/cart/items", {"variantId": variant, "quantity": 1}, csrf)
    ensure(status, 201, "Guest add item")
    item_id = next(item["id"] for item in body["data"]["items"] if item["variantId"] == variant)

    status, body = call(guest, "PATCH", f"/cart/items/{item_id}", {"quantity": 2}, csrf)
    ensure(status, 200, "Guest quantity update")
    assert next(item for item in body["data"]["items"] if item["id"] == item_id)["quantity"] == 2

    status, body = call(guest, "POST", "/auth/login", {"email": email, "password": password}, csrf)
    ensure(status, 200, "User login")
    status, body = call(user, "POST", "/cart/merge", csrf=csrf)
    ensure(status, 200, "Guest-to-user merge")
    merged = [item for item in body["data"]["items"] if item["variantId"] == variant]
    assert len(merged) == 1 and merged[0]["quantity"] == 2, "Unexpected merged quantity"

    status, body = call(user, "GET", "/cart")
    ensure(status, 200, "Authenticated cart persisted")
    assert any(item["variantId"] == variant for item in body["data"]["items"])

    status, body = call(user, "DELETE", "/cart", csrf=csrf)
    ensure(status, 200, "Clear test user cart")
    assert body["data"]["items"] == []

    outsider = client()
    status, _ = call(outsider, "POST", "/cart/items", {"variantId": variant, "quantity": 1})
    ensure(status, 403, "Mutation without CSRF rejected")
    print("ALL PASS | EC-006 smoke scenarios verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL | {error}", file=sys.stderr)
        sys.exit(1)
