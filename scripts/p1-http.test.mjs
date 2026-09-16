import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

// Run only against an explicitly selected local P1 server and disposable test account.
const base = process.env.VISORA_TEST_API_URL;
const origin = process.env.VISORA_TEST_ORIGIN;
const adminEmail = process.env.VISORA_TEST_ADMIN_EMAIL;
const adminPassword = process.env.VISORA_TEST_ADMIN_PASSWORD;

test('P1 HTTP contract: login, user management, revocation and CSRF', {
  skip: !base || !origin || !adminEmail || !adminPassword,
}, async () => {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Only a loopback test server is allowed');
  const request = (route, options = {}) => fetch(new URL(route, base), {
    ...options,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Visora-Request': '1',
      ...options.headers,
    },
  });
  const login = async (email, password) => {
    const response = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200, 'Valid test credentials must log in');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookie = response.headers.get('set-cookie');
    assert.ok(/HttpOnly/i.test(cookie), 'Session cookie must be HttpOnly');
    assert.ok(/SameSite=Strict/i.test(cookie), 'Session cookie must use SameSite=Strict');
    assert.ok(/Path=\//.test(cookie), 'Session cookie must use Path=/');
    assert.ok(/Max-Age=[1-9][0-9]*/i.test(cookie), 'Login cookie lifetime must reflect the configured session TTL');
    const result = await response.json();
    assert.deepEqual(Object.keys(result.user).sort(), ['createdAt', 'email', 'id', 'role', 'status']);
    return { cookie: cookie.split(';')[0], user: result.user };
  };

  assert.equal((await request('/healthz')).status, 200);
  assert.equal((await request('/readyz')).status, 200);
  assert.equal((await request('/api/auth/me')).status, 401);
  const forged = await request('/api/auth/login', {
    method: 'POST', headers: { Origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert.equal(forged.status, 403, 'An untrusted origin must not obtain a session');

  const admin = await login(adminEmail, adminPassword);
  assert.equal(admin.user.role, 'admin');
  const token = randomBytes(8).toString('hex');
  const email = `visora-p1-${token}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const adminHeaders = { Cookie: admin.cookie };
  const create = (payload) => request('/api/admin/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify(payload) });
  const elevated = await create({ email, password, role: 'admin' });
  assert.equal(elevated.status, 400, 'Client-supplied roles must be rejected');
  const created = await create({ email, password });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(user.role, 'user');
  assert.equal(user.status, 'active');
  assert.equal((await create({ email, password })).status, 409);
  const listed = await request(`/api/admin/users?email=${encodeURIComponent(email)}`, { headers: adminHeaders });
  assert.equal(listed.status, 200);
  const page = await listed.json();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, user.id);
  assert.equal(page.nextCursor, null);

  const member = await login(email, password);
  assert.equal((await request('/api/admin/users', { headers: { Cookie: member.cookie } })).status, 403);
  const noCsrfHeader = await request(`/api/admin/users/${user.id}`, {
    method: 'PATCH', headers: { ...adminHeaders, 'X-Visora-Request': '' }, body: JSON.stringify({ status: 'disabled' }),
  });
  assert.equal(noCsrfHeader.status, 403);
  const setStatus = (id, status) => request(`/api/admin/users/${id}`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status }),
  });
  assert.equal((await setStatus(admin.user.id, 'disabled')).status, 409);
  assert.equal((await setStatus(user.id, 'disabled')).status, 200);
  assert.equal((await request('/api/auth/me', { headers: { Cookie: member.cookie } })).status, 401);
  assert.equal((await setStatus(user.id, 'active')).status, 200);
  assert.equal((await request('/api/auth/me', { headers: { Cookie: member.cookie } })).status, 401, 'Restoring a user must not resurrect the old session');
  const restored = await login(email, password);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: restored.cookie }, body: '{}' })).status, 204);
  assert.equal((await request('/api/auth/me', { headers: { Cookie: restored.cookie } })).status, 401);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: adminHeaders, body: '{}' })).status, 204);
  const repeatedLogout = await request('/api/auth/logout', { method: 'POST', body: '{}' });
  assert.equal(repeatedLogout.status, 204);
  assert.ok(/Max-Age=0/i.test(repeatedLogout.headers.get('set-cookie')), 'Logout must clear its cookie');
});
