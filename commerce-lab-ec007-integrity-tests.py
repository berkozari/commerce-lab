#!/usr/bin/env python3
"""EC-007: insufficient stock, concurrent checkout, multi-line transaction rollback.

Only run against disposable LOCAL CommerceLab development data. Creates category,
products, variants and (on successful concurrency) a cancelled demo order.
Does not modify existing products' stock. Requires two CUSTOMER accounts with EMPTY
carts and one ADMIN account. Uses standard library only.
"""
import getpass
import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = os.environ.get('COMMERCE_API', 'http://localhost:3000/api/v1').rstrip('/')
parsed_url = urlparse(BASE)
if parsed_url.hostname not in ('localhost', '127.0.0.1', '::1'):
    sys.exit('REFUSED: this test modifies data and is restricted to localhost.')

TOTAL = 0

def check(ok, label, detail=''):
    global TOTAL
    if not ok:
        raise AssertionError(f'{label} — {detail}')
    TOTAL += 1
    print(f'PASS | {label}')


def session():
    return build_opener(HTTPCookieProcessor(CookieJar()))


def request(client, method, path, data=None, csrf=None, key=None):
    headers = {'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    if csrf:
        headers['x-csrf-token'] = csrf
    if key:
        headers['Idempotency-Key'] = key
    req = Request(BASE + path, data=json.dumps(data).encode() if data is not None else None,
                  headers=headers, method=method)
    try:
        res = client.open(req, timeout=35)
    except HTTPError as exc:
        res = exc
    except URLError as exc:
        raise RuntimeError(f'API connection failure: {exc.reason}') from exc
    raw = res.read().decode(errors='replace')
    try:
        content = json.loads(raw)
    except ValueError:
        content = {}
    return res.status, content


def must(client, method, path, code, label, data=None, csrf=None, key=None):
    status, payload = request(client, method, path, data, csrf, key)
    if status != code:
        error = payload.get('error', {}) if isinstance(payload, dict) else {}
        msg = error.get('message', '') if isinstance(error, dict) else ''
        raise AssertionError(f'{label}: HTTP {status}, expected {code}. {msg[:120]}')
    check(True, f'{label} (HTTP {code})')
    return payload.get('data', {})


def sign_in(role, email, password):
    s = session()
    token = must(s, 'GET', '/auth/csrf', 200, f'{role}: CSRF')['csrfToken']
    body = must(s, 'POST', '/auth/login', 200, f'{role}: login',
                {'email': email, 'password': password}, token)
    check(body['user']['role'] == role, f'{role}: role verified')
    return s, token


def address():
    return {'recipientName': 'Integrity Test', 'phone': '05550000000',
            'country': 'TR', 'city': 'Istanbul', 'district': 'Kadikoy',
            'addressLine': 'Integrity Test Street No 42', 'postalCode': '34710'}


def cart_empty(s, label):
    cart = must(s, 'GET', '/cart', 200, f'{label}: read cart')
    check(cart['items'] == [], f'{label}: cart empty before test')


def orders_total(s):
    return must(s, 'GET', '/orders?limit=1', 200, 'Read order count')['total']


def stock(admin, product_id, variant_id):
    product = must(admin, 'GET', f'/admin/products/{product_id}', 200, 'Read isolated test product')
    variant = next((v for v in product['variants'] if v['id'] == variant_id), None)
    if not variant:
        raise AssertionError('Created variant missing from ADMIN product')
    return variant['inventory']['quantity']


def add(s, csrf, variant_id, quantity, label):
    return must(s, 'POST', '/cart/items', 201, label,
                {'variantId': variant_id, 'quantity': quantity}, csrf)


def clear(s, csrf, label):
    must(s, 'DELETE', '/cart', 200, label, csrf=csrf)


def set_stock(admin, csrf, variant_id, amount):
    must(admin, 'PATCH', f'/admin/inventory/{variant_id}', 200,
         f'Set isolated stock to {amount}', {'quantity': amount}, csrf)


def build_fixtures(admin, token):
    suffix = uuid.uuid4().hex[:10]
    category = must(admin, 'POST', '/admin/categories', 201, 'Create isolated test category',
                    {'name': f'EC007 Integrity {suffix}', 'slug': f'ec007-integrity-{suffix}'}, token)
    product = must(admin, 'POST', '/admin/products', 201, 'Create isolated test product',
                   {'categoryId': category['id'], 'name': f'Integrity Product {suffix}',
                    'slug': f'ec007-integrity-product-{suffix}', 'status': 'DRAFT'}, token)
    variants = []
    for number in range(1, 4):
        variant = must(admin, 'POST', f"/admin/products/{product['id']}/variants", 201,
                       f'Create test variant {number}',
                       {'sku': f'EC007-{suffix}-{number}', 'name': f'Test variant {number}',
                        'price': '19.90', 'quantity': 2, 'isActive': True}, token)
        variants.append(variant['id'])
    must(admin, 'PATCH', f"/admin/products/{product['id']}", 200,
         'Publish isolated test product', {'status': 'ACTIVE'}, token)
    return product['id'], variants


def checkout(s, csrf):
    return request(s, 'POST', '/checkout', {'shippingAddress': address()}, csrf,
                   f'integrity_{uuid.uuid4().hex}')


def main():
    print('EC-007 INVENTORY INTEGRITY TESTS — LOCAL DEVELOPMENT ONLY')
    print('This creates new isolated category/products and uses TWO empty CUSTOMER carts.')
    first_email = input('CUSTOMER 1 email: ').strip()
    first_pw = getpass.getpass('CUSTOMER 1 password: ')
    second_email = input('CUSTOMER 2 email: ').strip()
    second_pw = getpass.getpass('CUSTOMER 2 password: ')
    admin_email = input('ADMIN email: ').strip()
    admin_pw = getpass.getpass('ADMIN password: ')
    if not all((first_email, first_pw, second_email, second_pw, admin_email, admin_pw)) or first_email == second_email:
        sys.exit('Two distinct CUSTOMER accounts and ADMIN credentials are required.')
    customer1, csrf1 = sign_in('CUSTOMER', first_email, first_pw)
    customer2, csrf2 = sign_in('CUSTOMER', second_email, second_pw)
    admin, csrf_admin = sign_in('ADMIN', admin_email, admin_pw)
    cart_empty(customer1, 'CUSTOMER 1')
    cart_empty(customer2, 'CUSTOMER 2')
    product_id, (v_insufficient, v_race, v_rollback) = build_fixtures(admin, csrf_admin)

    print('\n=== T02: INSUFFICIENT STOCK ===')
    add(customer1, csrf1, v_insufficient, 2, 'Add two units while stock is 2')
    set_stock(admin, csrf_admin, v_insufficient, 1)
    count_before = orders_total(customer1)
    status, _ = checkout(customer1, csrf1)
    check(status == 409, 'Insufficient-stock checkout rejected (409)', f'HTTP {status}')
    check(orders_total(customer1) == count_before, 'No order created on insufficient stock')
    check(stock(admin, product_id, v_insufficient) == 1, 'Insufficient-stock inventory unchanged')
    current = must(customer1, 'GET', '/cart', 200, 'Read rejected cart')
    check(len(current['items']) == 1 and current['items'][0]['quantity'] == 2,
          'Rejected checkout preserves cart')
    clear(customer1, csrf1, 'Clear test cart after insufficient stock')

    print('\n=== T03: CONCURRENT CHECKOUT ===')
    add(customer1, csrf1, v_race, 1, 'CUSTOMER 1 adds race variant')
    add(customer2, csrf2, v_race, 1, 'CUSTOMER 2 adds race variant')
    set_stock(admin, csrf_admin, v_race, 1)
    before_1, before_2 = orders_total(customer1), orders_total(customer2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(checkout, customer1, csrf1)
        b = pool.submit(checkout, customer2, csrf2)
        results = [a.result(), b.result()]
    statuses = sorted(status for status, _ in results)
    check(statuses == [201, 409], 'Exactly one checkout succeeds, one conflicts', str(statuses))
    check(stock(admin, product_id, v_race) == 0, 'Race stock is 0, never negative')
    after_1, after_2 = orders_total(customer1), orders_total(customer2)
    check((after_1 - before_1) + (after_2 - before_2) == 1, 'Only one new order created')
    winner_index = next(i for i, (status, _) in enumerate(results) if status == 201)
    winner = customer1 if winner_index == 0 else customer2
    winner_csrf = csrf1 if winner_index == 0 else csrf2
    winner_order = results[winner_index][1]['data']['order']
    must(winner, 'POST', f"/orders/{winner_order['id']}/demo-payment", 200,
         'Cancel winning order via failed demo payment (test cleanup)',
         {'outcome': 'failure'}, winner_csrf)
    check(stock(admin, product_id, v_race) == 1, 'Failed demo payment restores isolated stock')
    clear(customer1, csrf1, 'Clear CUSTOMER 1 test cart')
    clear(customer2, csrf2, 'Clear CUSTOMER 2 test cart')

    print('\n=== T04: TRANSACTION ROLLBACK ===')
    # Create an additional variant so we have two independent rows in one checkout.
    suffix = uuid.uuid4().hex[:10]
    first = must(admin, 'POST', f'/admin/products/{product_id}/variants', 201,
                 'Create rollback-first variant',
                 {'sku': f'EC007-ROLL-{suffix}', 'name': 'Rollback first',
                  'price': '39.90', 'quantity': 1}, csrf_admin)['id']
    add(customer1, csrf1, first, 1, 'Add first rollback line (stock 1)')
    add(customer1, csrf1, v_rollback, 1, 'Add second rollback line (stock 2)')
    set_stock(admin, csrf_admin, v_rollback, 0)
    count_before = orders_total(customer1)
    status, _ = checkout(customer1, csrf1)
    check(status == 409, 'Multi-item checkout rejected (409)', f'HTTP {status}')
    check(stock(admin, product_id, first) == 1, 'Earlier line decrement rolled back')
    check(stock(admin, product_id, v_rollback) == 0, 'Unavailable second line unchanged')
    check(orders_total(customer1) == count_before, 'No partial order created')
    cart = must(customer1, 'GET', '/cart', 200, 'Read cart after rollback')
    check({x['variantId'] for x in cart['items']} == {first, v_rollback}, 'Both cart lines preserved')
    clear(customer1, csrf1, 'Clear rollback test cart')
    print(f'\nALL PASS | {TOTAL} checks across 3 integrity scenarios')
    print('Note: Test category/product/variants and one CANCELLED order remain for audit; no live products modified.')


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, ValueError, KeyError, IndexError, RuntimeError, TypeError) as exc:
        print(f'FAIL | {exc}', file=sys.stderr)
        print('CAUTION | Check newly created PENDING orders and test carts before retrying.', file=sys.stderr)
        sys.exit(1)
