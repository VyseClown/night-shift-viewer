// Unit tests for resolveRunDir: archived vs live resolution, and the guard that
// an unknown/stale runId must NOT silently resolve to the current live run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveRunDir, listRuns } from '../src/runs.js';

// Build a throwaway project root with an optional live state and/or archived run.
function makeProject({ liveRunId, archivedRunId } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nsv-run-'));
  const ns = path.join(root, '.night-shift');
  mkdirSync(ns, { recursive: true });
  if (liveRunId) {
    writeFileSync(path.join(ns, 'state.json'), JSON.stringify({ run_id: liveRunId }));
  }
  if (archivedRunId) {
    mkdirSync(path.join(ns, 'archive', archivedRunId), { recursive: true });
  }
  return { project: { id: 't', root }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('archived run resolves to its archive dir', () => {
  const { project, cleanup } = makeProject({ archivedRunId: 'RUN-A' });
  try {
    const r = resolveRunDir(project, 'RUN-A');
    assert.ok(r);
    assert.equal(r.isArchived, true);
    assert.ok(r.dir.endsWith(path.join('.night-shift', 'archive', 'RUN-A')));
  } finally {
    cleanup();
  }
});

test('live run resolves only when state.run_id matches', () => {
  const { project, cleanup } = makeProject({ liveRunId: 'RUN-LIVE' });
  try {
    const r = resolveRunDir(project, 'RUN-LIVE');
    assert.ok(r);
    assert.equal(r.isArchived, false);
    assert.ok(r.dir.endsWith('.night-shift'));
  } finally {
    cleanup();
  }
});

test('unknown runId does NOT resolve to the current live run (the bug)', () => {
  const { project, cleanup } = makeProject({ liveRunId: 'RUN-LIVE' });
  try {
    assert.equal(resolveRunDir(project, 'SOME-OTHER-ID'), null);
  } finally {
    cleanup();
  }
});

test('archived match wins even when a different run is live', () => {
  const { project, cleanup } = makeProject({ liveRunId: 'RUN-LIVE', archivedRunId: 'RUN-OLD' });
  try {
    const r = resolveRunDir(project, 'RUN-OLD');
    assert.ok(r);
    assert.equal(r.isArchived, true);
  } finally {
    cleanup();
  }
});

test('no archive and no live state resolves to null', () => {
  const { project, cleanup } = makeProject({});
  try {
    assert.equal(resolveRunDir(project, 'anything'), null);
  } finally {
    cleanup();
  }
});

test('malformed live state.json resolves to null, never throws', () => {
  const { project, cleanup } = makeProject({});
  try {
    writeFileSync(path.join(project.root, '.night-shift', 'state.json'), '{ not json');
    assert.equal(resolveRunDir(project, 'whatever'), null);
  } finally {
    cleanup();
  }
});

// Discovery smoke test against the real configured PROJECTS. Resilient: asserts
// the shape, not specific runs (FS contents vary), and that it never throws.
test('listRuns returns well-formed, newest-first run summaries', async () => {
  const runs = await listRuns();
  assert.ok(Array.isArray(runs));
  for (const r of runs) {
    assert.equal(typeof r.runId, 'string');
    assert.equal(typeof r.project, 'string');
    assert.equal(typeof r.isArchived, 'boolean');
  }
  // Sorted newest-first using the same comparator listRuns applies.
  for (let i = 1; i < runs.length; i++) {
    const cmp = String(runs[i - 1].startedAt).localeCompare(String(runs[i].startedAt));
    assert.ok(cmp >= 0);
  }
});
