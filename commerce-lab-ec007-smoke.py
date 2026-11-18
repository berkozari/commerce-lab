#!/usr/bin/env python3
"""CommerceLab EC-007 local checkout/order smoke tests (Python standard library).

Run only against a disposable local development database/account. Requires an
ACTIVE ProductVariant UUID with >= 3 units and a CUSTOMER account with EMPTY cart.
Creates 2 orders (paid demo + failed demo); the successful order permanently
consumes 1 unit of inventory. The failed order should restore its reserved unit.
If interrupted, a PENDING order can remain and reserve stock indefinitely.
Never logs credentials, cookies, JWTs or CSRF token values.
"""
import getpass
import json
import os
import sys
import uuid
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = os.environ.get('COMMERCE_API', 'http://localhost:3000/api/v1').rstrip('/')
PASS_COUNT = 0


def client():
    return build_opener(HTTPCookieProcessor(CookieJar()))


def call(session, method, path, data=None, csrf=None, key=None):
    headers = {'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    if csrf is not None:
        headers['x-csrf-token'] = csrf
    if key is not None:
        headers['Idempotency-Key'] = key
    payload = json.dumps(data).encode('utf-8') if data is not None else None
    req = Request(BASE + path, data=payload, headers=headers, method=method)
    try:
        response = session.open(req, timeout=25)
    except HTTPError as exc:
        response = exc
    except URLError as exc:
        raise RuntimeError(f'API connection failed: {exc.reason}') from exc
    body = response.read().decode('utf-8', errors='replace')
    try:
        parsed = json.loads(body)
    except ValueError:
        parsed = {'raw': body[:240]}
    return response.status, parsed


def check(condition, title, detail=''):
    global PASS_COUNT
    if not condition:
        raise AssertionError(f'{title} FAILED. {detail}')
    PASS_COUNT += 1
    print(f'PASS | {title}')


def expect(session, method, path, expected, title, data=None, csrf=None, key=None):
    status, body = call(session, method, path, data, csrf, key)
    if status != expected:
        # Do not print full responses (auth data could be included).
        err = body.get('error', {}) if isinstance(body, dict) else {}
        message = (err.get('message', '') if isinstance(err, dict) else str(err))[:160]
        raise AssertionError(f'{title}: HTTP {status}, expected {expected}; {message}')
    check(True, f'{title} (HTTP {status})')
    return body.get('data', {})


def csrf_for(session):
    return expect(session, 'GET', '/auth/csrf', 200, 'Issue CSRF token')['csrfToken']


def login(session, email, password, csrf, role=None):
    data = expect(session, 'POST', '/auth/login', 200, 'Login',
                  {'email': email, 'password': password}, csrf)
    if role:
        check(data.get('user', {}).get('role') == role, f'Account role is {role}')
    return data


def address():
    return {'recipientName': 'Checkout Smoke Test', 'phone': '05550000000',
            'country': 'TR', 'city': 'Istanbul', 'district': 'Kadikoy',
            'addressLine': 'Test Street Number 42 Apartment 3', 'postalCode': '34710'}


def stock_from_admin(admin, product_id, variant_id):
    product = expect(admin, 'GET', f'/admin/products/{product_id}', 200, 'Admin reads product stock')
    variant = next((v for v in product['variants'] if v['id'] == variant_id), None)
    if variant is None or variant.get('inventory') is None:
        raise AssertionError('Variant/inventory not present in admin product response')
    return variant['inventory']['quantity']


def main():
    print('EC-007 CHECKOUT SMOKE — LOCAL / DISPOSABLE DATA ONLY')
    print('Uses an EMPTY CUSTOMER cart and leaves a paid demo order in the database.')
    print('A successful run consumes 1 stock unit permanently. Pending orders reserve stock.')
    variant_id = input('ACTIVE ProductVariant UUID (stock >= 3): ').strip()
    uuid.UUID(variant_id)
    email = input('Local CUSTOMER email: ').strip()
    password = getpass.getpass('Local CUSTOMER password: ')
    print('Optional: second CUSTOMER account to test order ownership (Enter to skip).')
    other_email = input('Second CUSTOMER email [optional]: ').strip()
    other_password = getpass.getpass('Second CUSTOMER password: ') if other_email else ''
    print('Optional: ADMIN account to verify inventory before/after and ADMIN endpoints.')
    admin_email = input('Local ADMIN email [optional]: ').strip()
    admin_password = getpass.getpass('Local ADMIN password: ') if admin_email else ''

    user = client()
    csrf = csrf_for(user)
    login(user, email, password, csrf, 'CUSTOMER')
    cart = expect(user, 'GET', '/cart', 200, 'Read initial cart')
    check(cart.get('items') == [], 'Customer cart initially empty',
          'Use a disposable account with no cart items; no cleanup performed.')

    outsider = client()
    status, _ = call(outsider, 'POST', '/checkout', {'shippingAddress': address()}, key=f'smoke_{uuid.uuid4().hex}')
    check(status == 403, 'Checkout without CSRF rejected (403)')
    outsider_csrf = csrf_for(outsider)
    status, _ = call(outsider, 'POST', '/checkout', {'shippingAddress': address()}, outsider_csrf, f'smoke_{uuid.uuid4().hex}')
    check(status == 401, 'Checkout without authentication rejected (401)')
    status, _ = call(user, 'GET', '/admin/orders')
    check(status == 403, 'CUSTOMER cannot list ADMIN orders (403)')

    admin = None
    if admin_email:
        admin = client()
        admin_csrf = csrf_for(admin)
        login(admin, admin_email, admin_password, admin_csrf, 'ADMIN')
    else:
        admin_csrf = None

    # Place first order, replay with same key, verify no duplicate, pay successfully.
    cart = expect(user, 'POST', '/cart/items', 201, 'Add item for successful checkout',
                  {'variantId': variant_id, 'quantity': 1}, csrf)
    first_item = next((x for x in cart['items'] if x['variantId'] == variant_id), None)
    check(first_item is not None and first_item['quantity'] == 1, 'Correct cart line quantity')
    product_id = first_item['product']['id']
    before = stock_from_admin(admin, product_id, variant_id) if admin else None
    first_key = f'ec007_{uuid.uuid4().hex}'
    first = expect(user, 'POST', '/checkout', 201, 'New checkout creates order',
                   {'shippingAddress': address()}, csrf, first_key)
    first_id = first['order']['id']
    check(first['replayed'] is False and first['order']['status'] == 'PENDING'
          and first['order']['paymentStatus'] == 'UNPAID', 'New order PENDING / UNPAID')
    check(len(first['order']['items']) == 1 and first['order']['items'][0]['variantId'] == variant_id,
          'Order snapshot contains purchased variant')
    replay = expect(user, 'POST', '/checkout', 200, 'Idempotent replay',
                    {'shippingAddress': address()}, csrf, first_key)
    check(replay['replayed'] is True and replay['order']['id'] == first_id,
          'Replay returns same order, no duplicate')
    other_addr = address()
    other_addr['district'] = 'Besiktas'
    status, _ = call(user, 'POST', '/checkout', {'shippingAddress': other_addr}, csrf, first_key)
    check(status == 409, 'Same key + different shipping address rejected (409)')
    cart = expect(user, 'GET', '/cart', 200, 'Read cart after checkout')
    check(cart['items'] == [], 'Checkout clears cart')
    mine = expect(user, 'GET', f'/orders/{first_id}', 200, 'Owner reads order detail')
    check(mine['id'] == first_id, 'Owner order ID matches')
    history = expect(user, 'GET', '/orders', 200, 'Owner reads order history')
    check(any(x['id'] == first_id for x in history.get('items', [])), 'Order is present in history')
    if admin:
        current = stock_from_admin(admin, product_id, variant_id)
        check(current == before - 1, 'Successful checkout decrements inventory by 1')
    paid = expect(user, 'POST', f'/orders/{first_id}/demo-payment', 200,
                  'Demo payment succeeds', {'outcome': 'success'}, csrf)
    check(paid['status'] == 'CONFIRMED' and paid['paymentStatus'] == 'PAID_DEMO',
          'Payment confirmation sets CONFIRMED / PAID_DEMO')

    # Second order: payment failure must cancel and restore stock.
    cart = expect(user, 'POST', '/cart/items', 201, 'Add item for failed-payment checkout',
                  {'variantId': variant_id, 'quantity': 1}, csrf)
    second_key = f'ec007_{uuid.uuid4().hex}'
    second = expect(user, 'POST', '/checkout', 201, 'Create second PENDING order',
                    {'shippingAddress': address()}, csrf, second_key)
    second_id = second['order']['id']
    if admin:
        reserved = stock_from_admin(admin, product_id, variant_id)
        check(reserved == before - 2, 'Second checkout reserves another unit')
    failed = expect(user, 'POST', f'/orders/{second_id}/demo-payment', 200,
                    'Demo payment fails', {'outcome': 'failure'}, csrf)
    check(failed['status'] == 'CANCELLED' and failed['paymentStatus'] == 'UNPAID',
          'Payment failure cancels order')
    if admin:
        restored = stock_from_admin(admin, product_id, variant_id)
        check(restored == before - 1, 'Failed payment restores exactly one unit')

    # Optional separate-user ownership check.
    if other_email:
        other = client()
        other_csrf = csrf_for(other)
        login(other, other_email, other_password, other_csrf, 'CUSTOMER')
        status, _ = call(other, 'GET', f'/orders/{first_id}')
        check(status == 404, 'Other CUSTOMER cannot see order (404)')
        status, _ = call(other, 'POST', f'/orders/{first_id}/demo-payment',
                         {'outcome': 'success'}, other_csrf)
        check(status == 404, 'Other CUSTOMER cannot pay order (404)')
    else:
        print('SKIP | Cross-user order ownership (second CUSTOMER not provided)')

    if admin:
        all_orders = expect(admin, 'GET', '/admin/orders', 200, 'ADMIN lists orders')
        check(any(x['id'] == first_id for x in all_orders.get('items', [])), 'ADMIN sees created order')
        status, _ = call(admin, 'PATCH', f'/admin/orders/{first_id}/status',
                         {'status': 'DELIVERED'}, admin_csrf)
        check(status == 409, 'ADMIN invalid status jump rejected (409)')
        for status_name in ('PROCESSING', 'SHIPPED', 'DELIVERED'):
            result = expect(admin, 'PATCH', f'/admin/orders/{first_id}/status', 200,
                            f'ADMIN transitions to {status_name}', {'status': status_name}, admin_csrf)
            check(result['status'] == status_name, f'Stored status is {status_name}')
    else:
        print('SKIP | ADMIN stock & order transition checks (ADMIN not provided)')

    print(f'ALL PASS | {PASS_COUNT} assertions passed; optional tests may have been skipped')
    print('Final state: one DELIVERED/CONFIRMED paid demo order (depending on ADMIN tests),')
    print('one CANCELLED failed demo order; net stock change -1.')


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, ValueError, KeyError, TypeError, RuntimeError, StopIteration) as exc:
        print(f'FAIL | {exc}', file=sys.stderr)
        print('CAUTION | Check for a PENDING order and reserved stock before retrying.', file=sys.stderr)
        sys.exit(1)
