// Unit tests for project auto-discovery: a sibling repo is a night-shift target
// when it is its own git repo and has opted in (gitignores .night-shift/ or
// already has a .night-shift/ run dir). Non-repos and unopted dirs are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverProjects, isNightShiftProject } from '../config.js';

// Build a throwaway workspace root with child dirs in given shapes.
//   shape: { git?, gitignore?: string, nightshift? }
function makeWorkspace(children) {
  const root = mkdtempSync(path.join(tmpdir(), 'nsv-disc-'));
  for (const [name, shape] of Object.entries(children)) {
    const dir = path.join(root, name);
    mkdirSync(dir, { recursive: true });
    if (shape.git) mkdirSync(path.join(dir, '.git'), { recursive: true });
    if (shape.gitignore != null) writeFileSync(path.join(dir, '.gitignore'), shape.gitignore);
    if (shape.nightshift) mkdirSync(path.join(dir, '.night-shift'), { recursive: true });
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('discovers a repo that gitignores .night-shift/', () => {
  const { root, cleanup } = makeWorkspace({
    'good-repo': { git: true, gitignore: 'node_modules\n.night-shift/\n' },
  });
  try {
    assert.deepEqual(discoverProjects(root).map((d) => path.basename(d)), ['good-repo']);
  } finally {
    cleanup();
  }
});

test('discovers a repo that already has a .night-shift/ run dir', () => {
  const { root, cleanup } = makeWorkspace({
    'ran-before': { git: true, gitignore: 'node_modules\n', nightshift: true },
  });
  try {
    assert.deepEqual(discoverProjects(root).map((d) => path.basename(d)), ['ran-before']);
  } finally {
    cleanup();
  }
});

test('skips a non-git directory and an unopted repo', () => {
  const { root, cleanup } = makeWorkspace({
    'not-a-repo': { gitignore: '.night-shift/\n' }, // no .git
    'unopted-repo': { git: true, gitignore: 'node_modules\n' }, // no opt-in marker
  });
  try {
    assert.deepEqual(discoverProjects(root), []);
  } finally {
    cleanup();
  }
});

test('matches .night-shift with or without leading/trailing slashes', () => {
  for (const line of ['.night-shift', '.night-shift/', '/.night-shift', '/.night-shift/']) {
    const { root, cleanup } = makeWorkspace({ r: { git: true, gitignore: `x\n${line}\ny\n` } });
    try {
      assert.equal(discoverProjects(root).length, 1, `should match "${line}"`);
    } finally {
      cleanup();
    }
  }
});

test('returns results sorted and excludes dotfiles', () => {
  const { root, cleanup } = makeWorkspace({
    zebra: { git: true, nightshift: true },
    alpha: { git: true, nightshift: true },
    '.hidden': { git: true, nightshift: true },
  });
  try {
    assert.deepEqual(discoverProjects(root).map((d) => path.basename(d)), ['alpha', 'zebra']);
  } finally {
    cleanup();
  }
});

test('isNightShiftProject is false for a missing directory', () => {
  assert.equal(isNightShiftProject('/no/such/path/xyz'), false);
});

test('discoverProjects returns [] for an unreadable root', () => {
  assert.deepEqual(discoverProjects('/no/such/root/xyz'), []);
});
