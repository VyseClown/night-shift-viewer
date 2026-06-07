// Unit tests for the CSRF/CORS origin policy (isAllowedOrigin + ALLOWED_ORIGINS).
// This is the decision logic the csrfGuard and CORS middleware in server.js use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, ALLOWED_ORIGINS, PORT } from '../config.js';

test('missing Origin is allowed (curl / server-to-server / tests)', () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin(''), true);
  assert.equal(isAllowedOrigin(null), true);
});

test('the Vite dev origin is allowed', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), true);
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
});

test('the API origin itself is allowed', () => {
  assert.equal(isAllowedOrigin(`http://127.0.0.1:${PORT}`), true);
  assert.equal(isAllowedOrigin(`http://localhost:${PORT}`), true);
});

test('a cross-site origin is rejected (the drive-by launch vector)', () => {
  assert.equal(isAllowedOrigin('http://evil.com'), false);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
});

test('a different localhost port is rejected', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:9999'), false);
  assert.equal(isAllowedOrigin('http://localhost:3000'), false);
});

test('scheme mismatch is rejected (no https on the dev origin)', () => {
  assert.equal(isAllowedOrigin('https://127.0.0.1:5173'), false);
});

test('the allowlist is an exact-match Set, not a substring check', () => {
  assert.ok(ALLOWED_ORIGINS instanceof Set);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173.evil.com'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173/'), false);
});
