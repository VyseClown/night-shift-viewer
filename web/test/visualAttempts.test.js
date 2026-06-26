import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attemptThumbnails } from '../src/visualAttempts.js';

test('both URLs -> impl then diff, urls preserved', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: '/a.png', diffImageUrl: '/b.png' }),
    [{ url: '/a.png', label: 'impl' }, { url: '/b.png', label: 'diff' }],
  );
});

test('only screenshot -> single impl thumbnail', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: '/a.png', diffImageUrl: null }),
    [{ url: '/a.png', label: 'impl' }],
  );
});

test('only diff -> single diff thumbnail', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: null, diffImageUrl: '/b.png' }),
    [{ url: '/b.png', label: 'diff' }],
  );
});

test('neither resolved (older report) -> empty', () => {
  assert.deepEqual(attemptThumbnails({ screenshotUrl: null, diffImageUrl: null }), []);
});

test('missing fields / nullish attempt -> empty', () => {
  assert.deepEqual(attemptThumbnails({}), []);
  assert.deepEqual(attemptThumbnails(null), []);
  assert.deepEqual(attemptThumbnails(undefined), []);
});
