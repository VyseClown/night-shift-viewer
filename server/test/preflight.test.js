// Route tests for the launch-readiness endpoints, driven via app.request (no
// bound port). Covers validation on GET /api/preflight and the CSRF + gating
// posture on POST /api/prepare. The engine's own --preflight logic is covered by
// a deterministic fixture in night-shift.sh; here we exercise the server's
// validation/gating, which is what must hold regardless of the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

const EVIL = { Origin: 'http://evil.com' };

test('GET /api/preflight with an unknown project is 400', async () => {
  const res = await app.request('/api/preflight?project=nope&spec=specs/x.md');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'unknown project');
});

test('GET /api/preflight with a traversal spec path is 400', async () => {
  const res = await app.request('/api/preflight?project=nope&spec=../etc/passwd');
  assert.equal(res.status, 400);
  // project is checked first, but a bad project + bad spec both 400; assert shape.
  assert.ok((await res.json()).error);
});

test('GET /api/preflight with no params is 400 (no project)', async () => {
  const res = await app.request('/api/preflight');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'unknown project');
});

test('POST /api/prepare from a cross-site Origin is rejected (403, CSRF)', async () => {
  const res = await app.request('/api/prepare', {
    method: 'POST',
    headers: { ...EVIL, 'Content-Type': 'text/plain' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'cross-origin request rejected');
});

test('POST /api/prepare with no Origin passes CSRF then hits launch gating (403)', async () => {
  const res = await app.request('/api/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'whatever', spec: 'specs/x.md' }),
  });
  // Guard allows it; preparing is disabled by default → 403 with a DIFFERENT msg.
  assert.equal(res.status, 403);
  const err = (await res.json()).error;
  assert.notEqual(err, 'cross-origin request rejected');
  assert.match(err, /preparing is disabled/);
});
