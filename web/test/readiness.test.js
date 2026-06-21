// Unit tests for the pure preflight → UI mappers. No DOM, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistRows, prepareApplicable, preflightBlocks } from '../src/readiness.js';

const ready = {
  spec: { valid: true, errors: [] },
  branch: { base: 'main', feature: 'feat/x', current: 'feat/x', onFeature: true, onBase: false, worktreeConflict: false },
  tree: { clean: true, dirtyCount: 0 },
  gitignore: { nightShiftIgnored: true },
  ready: true,
  blockers: [],
};

const onBaseCleanSpec = {
  spec: { valid: true, errors: [] },
  branch: { base: 'main', feature: 'feat/x', current: 'main', onFeature: false, onBase: true, worktreeConflict: false },
  tree: { clean: true, dirtyCount: 0 },
  gitignore: { nightShiftIgnored: true },
  ready: false,
  blockers: ['not on feature branch feat/x'],
};

const dirtyInvalid = {
  spec: { valid: false, errors: ['First failing test or executable check:'] },
  branch: { base: 'main', feature: 'feat/x', current: 'main', onFeature: false, onBase: true, worktreeConflict: false },
  tree: { clean: false, dirtyCount: 3 },
  gitignore: { nightShiftIgnored: true },
  ready: false,
  blockers: ['spec invalid', 'not on feature branch feat/x', 'working tree dirty'],
};

test('checklistRows is empty for missing or unavailable reports', () => {
  assert.deepEqual(checklistRows(null), []);
  assert.deepEqual(checklistRows({ unavailable: true }), []);
});

test('checklistRows: a ready report has all rows ok', () => {
  const rows = checklistRows(ready);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.ok));
  assert.equal(rows.find((r) => r.key === 'branch').label, 'On feature branch feat/x');
});

test('checklistRows: a dirty+invalid report flags spec, branch, and tree', () => {
  const rows = checklistRows(dirtyInvalid);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.spec.ok, false);
  assert.match(by.spec.detail, /First failing test/);
  assert.equal(by.branch.ok, false);
  assert.equal(by.tree.ok, false);
  assert.match(by.tree.detail, /3 uncommitted/);
  assert.equal(by.gitignore.ok, true);
});

test('checklistRows: a worktree conflict adds a row', () => {
  const pf = { ...ready, ready: false, branch: { ...ready.branch, worktreeConflict: true } };
  assert.ok(checklistRows(pf).some((r) => r.key === 'worktree' && !r.ok));
});

test('prepareApplicable only when the branch is the sole fixable blocker', () => {
  assert.equal(prepareApplicable(onBaseCleanSpec), true); // clean + on base → checkout helps
  assert.equal(prepareApplicable(ready), false); // already ready
  assert.equal(prepareApplicable(dirtyInvalid), false); // dirty tree → prepare can't help
  assert.equal(prepareApplicable({ unavailable: true }), false);
  assert.equal(prepareApplicable(null), false);
});

test('preflightBlocks only when a usable report says not-ready', () => {
  assert.equal(preflightBlocks(ready), false);
  assert.equal(preflightBlocks(onBaseCleanSpec), true);
  assert.equal(preflightBlocks({ unavailable: true }), false);
  assert.equal(preflightBlocks(null), false);
});
