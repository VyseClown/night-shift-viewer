// Integration test for GET /api/optional-personas. Tolerant of an empty list so
// the suite does not depend on the installed engine version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

test('GET /api/optional-personas returns 200 with optional_personas array', async () => {
  const res = await app.request('/api/optional-personas');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(
    Object.prototype.hasOwnProperty.call(body, 'optional_personas'),
    'body must have optional_personas key',
  );
  assert.ok(Array.isArray(body.optional_personas), 'optional_personas must be an array');
  assert.ok(
    Object.prototype.hasOwnProperty.call(body, 'unavailable'),
    'body must have unavailable key',
  );
});

test('GET /api/optional-personas items have string name and contractHeading', async () => {
  const res = await app.request('/api/optional-personas');
  const body = await res.json();
  for (const item of body.optional_personas) {
    assert.equal(typeof item.name, 'string', 'name must be a string');
    assert.equal(typeof item.contractHeading, 'string', 'contractHeading must be a string');
  }
});

test('GET /api/optional-personas is ungated (no NSV_ALLOW_* required)', async () => {
  // Calling without any special headers must not return 403.
  const res = await app.request('/api/optional-personas');
  assert.notEqual(res.status, 403);
});
