// Integration tests driving the Hono app via app.request (no bound port).
// Covers health, 404s, the CSRF guard, and CORS reflection — the request-level
// behavior that the unit tests (origin.test.js, runResolution.test.js) underpin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

const EVIL = { Origin: 'http://evil.com' };
const VITE = { Origin: 'http://127.0.0.1:5173' };

test('GET /api/health returns ok', async () => {
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.projects));
});

test('unknown route is 404', async () => {
  const res = await app.request('/api/nope');
  assert.equal(res.status, 404);
});

test('unknown project run is 404', async () => {
  const res = await app.request('/api/runs/nonexistent-project/some-run-id');
  assert.equal(res.status, 404);
});

test('POST /api/launch from a cross-site Origin is rejected (403)', async () => {
  const res = await app.request('/api/launch', {
    method: 'POST',
    headers: { ...EVIL, 'Content-Type': 'text/plain' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'cross-origin request rejected');
});

test('POST /api/launch/:id/stop from a cross-site Origin is rejected (403)', async () => {
  const res = await app.request('/api/launch/abc/stop', {
    method: 'POST',
    headers: { ...EVIL, 'Content-Type': 'text/plain' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'cross-origin request rejected');
});

test('POST /api/launch with no Origin passes the guard (then hits launch gating)', async () => {
  const res = await app.request('/api/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  // Guard allows it; launching is disabled by default → 403 with a DIFFERENT msg.
  assert.equal(res.status, 403);
  assert.notEqual((await res.json()).error, 'cross-origin request rejected');
});

test('CORS: a cross-site Origin gets no Access-Control-Allow-Origin', async () => {
  const res = await app.request('/api/health', { headers: EVIL });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('CORS: the Vite origin is reflected (not wildcard)', async () => {
  const res = await app.request('/api/health', { headers: VITE });
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});
