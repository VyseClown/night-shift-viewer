// Unit tests for the pure spec-name validators (specNameSafe, resolveSpecPath)
// and the gating of the write endpoint PUT /api/specs/:name. Runs with
// NSV_ALLOW_EDIT unset, so editing is disabled and NO real file is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { specNameSafe, resolveSpecPath, parseMeta } from '../src/specs.js';
import { SPECS_DIR } from '../config.js';
import { app } from '../src/server.js';

const EVIL = { Origin: 'http://evil.com' };

test('specNameSafe accepts a plain .md basename', () => {
  assert.equal(specNameSafe('good.md'), true);
  assert.equal(specNameSafe('a-b_c.1.md'), true);
});

test('specNameSafe rejects empty / non-string', () => {
  assert.equal(specNameSafe(''), false);
  assert.equal(specNameSafe(undefined), false);
  assert.equal(specNameSafe(null), false);
  assert.equal(specNameSafe(42), false);
});

test('specNameSafe rejects traversal and separators', () => {
  assert.equal(specNameSafe('../x.md'), false);
  assert.equal(specNameSafe('a/b.md'), false);
  assert.equal(specNameSafe('a\\b.md'), false);
  assert.equal(specNameSafe('..'), false);
});

test('specNameSafe rejects absolute paths', () => {
  assert.equal(specNameSafe('/abs/x.md'), false);
  assert.equal(specNameSafe('/x.md'), false);
});

test('specNameSafe rejects non-.md and empty base', () => {
  assert.equal(specNameSafe('name.txt'), false);
  assert.equal(specNameSafe('name'), false);
  assert.equal(specNameSafe('.md'), false);
});

test('specNameSafe rejects over-length names', () => {
  assert.equal(specNameSafe('a'.repeat(300) + '.md'), false);
});

test('specNameSafe never throws on odd input', () => {
  assert.doesNotThrow(() => specNameSafe({}));
  assert.doesNotThrow(() => specNameSafe([]));
});

test('resolveSpecPath returns an absolute path inside SPECS_DIR for a good name', () => {
  const p = resolveSpecPath('good.md');
  assert.ok(typeof p === 'string');
  assert.ok(path.isAbsolute(p));
  assert.ok(p.startsWith(SPECS_DIR));
  assert.ok(p.endsWith('good.md'));
});

test('resolveSpecPath returns null for unsafe names', () => {
  assert.equal(resolveSpecPath('../x.md'), null);
  assert.equal(resolveSpecPath('a/b.md'), null);
  assert.equal(resolveSpecPath('/abs/x.md'), null);
  assert.equal(resolveSpecPath('name.txt'), null);
  assert.equal(resolveSpecPath(''), null);
});

test('resolveSpecPath never throws', () => {
  assert.doesNotThrow(() => resolveSpecPath({}));
});

test('PUT /api/specs/:name is 403 when editing is disabled (not a CORS rejection)', async () => {
  const res = await app.request('/api/specs/x.md', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown' },
    body: '# hello',
  });
  assert.equal(res.status, 403);
  assert.notEqual((await res.json()).error, 'cross-origin request rejected');
});

test('PUT /api/specs/:name from a cross-site Origin is rejected (403 CORS)', async () => {
  const res = await app.request('/api/specs/x.md', {
    method: 'PUT',
    headers: { ...EVIL, 'Content-Type': 'text/markdown' },
    body: '# hello',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'cross-origin request rejected');
});

// ── parseMeta / optionalReviewers ─────────────────────────────────────────────

test('parseMeta returns empty optionalReviewers when field is absent', () => {
  const meta = parseMeta('# My Spec\n- Track: web\n', 'my-spec.md');
  assert.deepEqual(meta.optionalReviewers, []);
});

test('parseMeta parses a comma-separated Optional reviewers field', () => {
  const text = '# Spec\n- Optional reviewers: Security Reviewer, API Contract Reviewer\n';
  const meta = parseMeta(text, 'spec.md');
  assert.deepEqual(meta.optionalReviewers, ['Security Reviewer', 'API Contract Reviewer']);
});

test('parseMeta parses a pipe-separated Optional reviewers field', () => {
  const text = '# Spec\n- Optional reviewers: Security Reviewer | Design Fidelity Reviewer\n';
  const meta = parseMeta(text, 'spec.md');
  assert.deepEqual(meta.optionalReviewers, ['Security Reviewer', 'Design Fidelity Reviewer']);
});

test('parseMeta returns empty optionalReviewers for "none"', () => {
  const meta = parseMeta('# Spec\n- Optional reviewers: none\n', 'spec.md');
  assert.deepEqual(meta.optionalReviewers, []);
});

test('parseMeta trims whitespace from reviewer names', () => {
  const meta = parseMeta('# Spec\n- Optional reviewers:  Security Reviewer , API Contract Reviewer  \n', 'spec.md');
  assert.deepEqual(meta.optionalReviewers, ['Security Reviewer', 'API Contract Reviewer']);
});
