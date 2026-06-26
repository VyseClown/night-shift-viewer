import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualDiff, overallPass } from '../src/visualDiff.js';

// A minimal conforming screen; override fields per case.
function screen(over = {}) {
  return {
    screen: 'Home',
    state: 'default',
    device: 'iphone-15',
    reference: 'ref/home.png',
    screenshot: 'shot/home.png',
    diff_pct: 0.5,
    tolerance: 1,
    pass: true,
    analysis: '',
    attempts: [],
    diff_image: 'diff/home.png',
    ...over,
  };
}

function report(screens, over = {}) {
  return { task: 'visual-validation', screens, ...over };
}

test('accepts a conforming multi-screen report (diff_image string and null)', () => {
  const r = report([
    screen(),
    screen({ screen: 'Settings', state: 'empty', diff_image: null }),
  ]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, true, errors.join('; '));
  assert.deepEqual(errors, []);
  assert.equal(overallPass(r), true);
});

test('diff_pct == tolerance is a pass (boundary)', () => {
  const r = report([screen({ diff_pct: 1, tolerance: 1, pass: true })]);
  assert.equal(validateVisualDiff(r).ok, true);
  assert.equal(overallPass(r), true);
});

test('overallPass is false when any screen fails (consistent fail)', () => {
  const r = report([
    screen(),
    screen({ diff_pct: 2, tolerance: 1, pass: false }),
  ]);
  assert.equal(validateVisualDiff(r).ok, true);
  assert.equal(overallPass(r), false);
});

test('rejects a missing per-screen key', () => {
  const s = screen();
  delete s.tolerance;
  assert.equal(validateVisualDiff(report([s])).ok, false);
});

test('rejects an extra per-screen key', () => {
  const r = report([screen({ extra: 1 })]);
  assert.equal(validateVisualDiff(r).ok, false);
});

test('rejects a non-number diff_pct', () => {
  assert.equal(validateVisualDiff(report([screen({ diff_pct: '0.5' })])).ok, false);
});

test('rejects a non-boolean pass', () => {
  assert.equal(validateVisualDiff(report([screen({ pass: 'true' })])).ok, false);
});

test('rejects pass=true when diff_pct > tolerance (inconsistency)', () => {
  assert.equal(
    validateVisualDiff(report([screen({ diff_pct: 5, tolerance: 1, pass: true })])).ok,
    false,
  );
});

test('rejects pass=false when diff_pct <= tolerance (inconsistency, other direction)', () => {
  assert.equal(
    validateVisualDiff(report([screen({ diff_pct: 0.2, tolerance: 1, pass: false })])).ok,
    false,
  );
});

test('rejects an empty screens array', () => {
  assert.equal(validateVisualDiff(report([])).ok, false);
});

test('rejects a non-string reference', () => {
  assert.equal(validateVisualDiff(report([screen({ reference: 42 })])).ok, false);
});

test('rejects an empty-string reference', () => {
  assert.equal(validateVisualDiff(report([screen({ reference: '' })])).ok, false);
});

test('rejects an empty-string diff_image (schema minLength:1)', () => {
  assert.equal(validateVisualDiff(report([screen({ diff_image: '' })])).ok, false);
});

test('rejects a negative diff_pct and a negative tolerance', () => {
  assert.equal(validateVisualDiff(report([screen({ diff_pct: -1 })])).ok, false);
  assert.equal(
    validateVisualDiff(report([screen({ tolerance: -1, diff_pct: 0, pass: true })])).ok,
    false,
  );
});

// ── Top-level / shape branches (TS-002) — each must be ok:false, never throw,
//    and overallPass:false. ──

test('rejects a missing task', () => {
  const r = { screens: [screen()] };
  assert.doesNotThrow(() => validateVisualDiff(r));
  assert.equal(validateVisualDiff(r).ok, false);
  assert.equal(overallPass(r), false);
});

test('rejects a non-string task', () => {
  const r = report([screen()], { task: 123 });
  assert.equal(validateVisualDiff(r).ok, false);
  assert.equal(overallPass(r), false);
});

test('rejects an extra top-level key', () => {
  const r = report([screen()], { extra: true });
  assert.equal(validateVisualDiff(r).ok, false);
  assert.equal(overallPass(r), false);
});

test('rejects a non-object report (null, array, string) without throwing', () => {
  for (const bad of [null, undefined, [], 'nope', 42]) {
    assert.doesNotThrow(() => validateVisualDiff(bad));
    assert.equal(validateVisualDiff(bad).ok, false);
    assert.equal(overallPass(bad), false);
  }
});

test('rejects a non-object screen element without throwing', () => {
  const r = report([null]);
  assert.doesNotThrow(() => validateVisualDiff(r));
  assert.equal(validateVisualDiff(r).ok, false);
  assert.equal(overallPass(r), false);
});

test('rejects a screen missing the new device key', () => {
  const r = report([{ ...screen(), device: undefined }]);
  delete r.screens[0].device;
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('missing key: device')));
});

test('rejects non-string analysis', () => {
  const r = report([screen({ analysis: 42 })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('analysis must be a string')));
});

test('rejects attempts that is not an array', () => {
  const r = report([screen({ attempts: 'nope' })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('attempts must be an array')));
});

test('rejects an attempt with a bad diff_pct', () => {
  const r = report([screen({ attempts: [{ attempt: 1, diff_pct: -1, pass: false, analysis: 'x', screenshot: 's', diff_image: null }] })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('attempts[0].diff_pct must be a number >= 0')));
});

test('accepts a conforming screen with device, analysis, attempts', () => {
  const r = report([screen({
    device: 'iphone-15', analysis: 'fixed spacing',
    attempts: [{ attempt: 1, diff_pct: 0.04, pass: true, analysis: 'within tolerance', screenshot: 's1', diff_image: null }],
  })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, true, errors.join('; '));
});

test('unmet_brief is optional: absent is fine (back-compat)', () => {
  const { ok, errors } = validateVisualDiff(report([screen()]));
  assert.equal(ok, true, errors.join('; '));
});

test('accepts an unmet_brief array of strings', () => {
  const r = report([screen({ unmet_brief: ['button 44pt', 'header color #FFF'] })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, true, errors.join('; '));
});

test('rejects an unmet_brief that is not an array of strings', () => {
  const r = report([screen({ unmet_brief: [1, 'ok'] })]);
  const { ok, errors } = validateVisualDiff(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('unmet_brief')));
});
