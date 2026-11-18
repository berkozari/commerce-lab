#!/usr/bin/env python3
"""CommerceLab EC-005 local catalog smoke test (stdlib only, no destructive cleanup)."""
import getpass
import http.cookiejar
import json
import os
import sys
import uuid
from urllib import error, parse, request

BASE = os.getenv("COMMERCE_API_URL", "http://localhost:3000/api/v1").rstrip("/")
jar = http.cookiejar.CookieJar()
opener = request.build_opener(request.HTTPCookieProcessor(jar))

def api(method, path, payload=None, csrf=None):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if csrf is not None:
        headers["x-csrf-token"] = csrf
    req = request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=15) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body = {"raw": raw.decode("utf-8", errors="replace")[:300]}
        return exc.code, body

def check(label, status, body, expected):
    ok = status in expected and (status >= 400 or (isinstance(body, dict) and body.get("success") is True))
    print(f"{'PASS' if ok else 'FAIL'} | {label}: HTTP {status}, expected {sorted(expected)}")
    if not ok:
        print("  Body:", json.dumps(body, ensure_ascii=False, default=str)[:700])
        raise RuntimeError(f"Check failed: {label}")
    return body["data"] if status < 400 else body

def main():
    print(f"CommerceLab EC-005 local smoke test | {BASE}")
    print("Only run against a disposable local development database. Creates a category and archives a test product.")
    email = os.getenv("COMMERCE_ADMIN_EMAIL") or input("ADMIN email: ").strip()
    password = os.getenv("COMMERCE_ADMIN_PASSWORD") or getpass.getpass("ADMIN password (hidden): ")
    status, body = api("GET", "/auth/csrf")
    csrf_data = check("CSRF token", status, body, {200})
    csrf = csrf_data["csrfToken"]
    status, body = api("POST", "/auth/login", {"email": email, "password": password}, csrf)
    login_data = check("ADMIN login", status, body, {200})
    if login_data["user"].get("role") != "ADMIN":
        raise RuntimeError("Authenticated account is not ADMIN. Grant ADMIN only in the local dev DB, then rerun.")
    print("PASS | User role is ADMIN")

    suffix = uuid.uuid4().hex[:10]
    cat_slug = f"ec005-test-{suffix}"
    prod_slug = f"ec005-demo-{suffix}"
    sku = f"EC005-{suffix.upper()}"

    # 1 category creation and persistence via public GET
    status, body = api("POST", "/admin/categories", {"name": f"EC005 Test {suffix}", "slug": cat_slug}, csrf)
    category = check("1. Create category", status, body, {201})
    category_id = category["id"]
    status, body = api("GET", "/categories")
    categories = check("1. Verify category via GET", status, body, {200})
    assert isinstance(categories, list) and any(c.get("id") == category_id for c in categories), "Category missing in GET /categories"
    print("PASS | Category persisted and listed")

    # 2 draft product hidden from public and visible to admin
    status, body = api("POST", "/admin/products", {"categoryId": category_id, "name": f"EC005 Test Product {suffix}", "slug": prod_slug, "description": "Local smoke test product"}, csrf)
    product = check("2. Create DRAFT product", status, body, {201})
    product_id = product["id"]
    assert product["status"] == "DRAFT", f"Expected DRAFT, got {product['status']}"
    status, body = api("GET", "/products/" + prod_slug)
    check("2. DRAFT product hidden from public", status, body, {404})
    status, body = api("GET", "/admin/products/" + product_id)
    check("2. DRAFT product visible to ADMIN", status, body, {200})

    # 3 variant + image; duplicate SKU must fail
    status, body = api("POST", f"/admin/products/{product_id}/variants", {"sku": sku, "name": "Default", "price": "1299.90", "currency": "TRY", "attributes": {"color": "black"}, "isActive": True, "quantity": 5}, csrf)
    variant = check("3. Add active variant", status, body, {201})
    variant_id = variant["id"]
    status, body = api("POST", f"/admin/products/{product_id}/images", {"url": "https://example.com/commerce-lab-demo.jpg", "altText": "EC005 Demo product", "position": 0}, csrf)
    check("3. Add product image", status, body, {201})
    status, body = api("POST", f"/admin/products/{product_id}/variants", {"sku": sku, "name": "Duplicate", "price": "1499.00", "quantity": 0}, csrf)
    check("3. Duplicate SKU rejected", status, body, {409})

    # 4 stock update and invalid negative value
    status, body = api("PATCH", f"/admin/inventory/{variant_id}", {"quantity": 12}, csrf)
    stock = check("4. Update inventory to 12", status, body, {200})
    assert stock["quantity"] == 12, f"Expected stock=12, got {stock['quantity']}"
    status, body = api("PATCH", f"/admin/inventory/{variant_id}", {"quantity": -1}, csrf)
    check("4. Negative inventory rejected", status, body, {400})

    # 5 publish; public list/detail must show it
    status, body = api("PATCH", f"/admin/products/{product_id}", {"status": "ACTIVE"}, csrf)
    active = check("5. Publish ACTIVE product", status, body, {200})
    assert active["status"] == "ACTIVE"
    status, body = api("GET", "/products/" + prod_slug)
    public = check("5. Public product detail visible", status, body, {200})
    assert public["id"] == product_id
    assert all("inventory" not in v for v in public.get("variants", [])), "Public variant exposed inventory"
    status, body = api("GET", "/products?" + parse.urlencode({"q": prod_slug, "limit": 50}))
    public_list = check("5. Public list query", status, body, {200})
    # Search matches product name or description, not slug; verify by category instead.
    status, body = api("GET", "/products?" + parse.urlencode({"categoryId": category_id, "limit": 50}))
    public_list = check("5. Public product listed", status, body, {200})
    assert any(p.get("id") == product_id for p in public_list["items"]), "Published product missing in public listing"
    print("PASS | Public response hides inventory")

    # 6 archive; public endpoints hide it and admin still finds it
    status, body = api("DELETE", f"/admin/products/{product_id}", csrf=csrf)
    archived = check("6. Archive product", status, body, {200})
    assert archived["status"] == "ARCHIVED"
    status, body = api("GET", "/products/" + prod_slug)
    check("6. Archived product hidden from public detail", status, body, {404})
    status, body = api("GET", "/products?" + parse.urlencode({"categoryId": category_id}))
    listing = check("6. Public list after archive", status, body, {200})
    assert all(p.get("id") != product_id for p in listing["items"]), "Archived product still public"
    status, body = api("GET", f"/admin/products/{product_id}")
    admin = check("6. Archived product visible to ADMIN", status, body, {200})
    assert admin["status"] == "ARCHIVED"
    print("\nALL PASS | EC-005 six scenarios verified on local API + PostgreSQL")
    print(f"Test records retained: category slug={cat_slug}, product slug={prod_slug} (ARCHIVED).")

if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        print(f"\nSTOP | {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
