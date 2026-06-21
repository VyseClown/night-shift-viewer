// Pure mappers turning a `--preflight` JSON report into UI-ready data. No React,
// no I/O — unit-tested with `node --test` (see web/test/readiness.test.js).

// One checklist row per readiness dimension: { key, ok, label, detail }. Returns
// [] when there is no report or the engine could not produce one (unavailable),
// so the caller renders nothing rather than a misleading all-red list.
export function checklistRows(pf) {
  if (!pf || pf.unavailable) return [];
  const rows = [
    {
      key: 'spec',
      ok: !!pf.spec?.valid,
      label: 'Spec valid',
      detail: pf.spec?.valid ? null : (pf.spec?.errors || []).join('; ') || 'spec invalid',
    },
    {
      key: 'branch',
      ok: !!pf.branch?.onFeature,
      label: `On feature branch${pf.branch?.feature ? ` ${pf.branch.feature}` : ''}`,
      detail: pf.branch?.onFeature ? null : `currently on ${pf.branch?.current || '(detached)'}`,
    },
    {
      key: 'tree',
      ok: !!pf.tree?.clean,
      label: 'Working tree clean',
      detail: pf.tree?.clean ? null : `${pf.tree?.dirtyCount ?? '?'} uncommitted change(s) — commit or stash first`,
    },
    {
      key: 'gitignore',
      ok: !!pf.gitignore?.nightShiftIgnored,
      label: '.night-shift gitignored',
      detail: pf.gitignore?.nightShiftIgnored ? null : 'add `.night-shift/` to the project .gitignore',
    },
  ];
  if (pf.branch?.worktreeConflict) {
    rows.push({
      key: 'worktree',
      ok: false,
      label: 'No worktree conflict',
      detail: 'the feature branch is checked out in another worktree',
    });
  }
  return rows;
}

// Prepare (create/checkout the feature branch) can help only when the branch is
// the blocker AND the tree is clean AND there is no worktree conflict. A dirty
// tree, an invalid spec, or a missing gitignore are not things Prepare fixes.
export function prepareApplicable(pf) {
  if (!pf || pf.unavailable || pf.ready) return false;
  return !pf.branch?.onFeature && !!pf.tree?.clean && !pf.branch?.worktreeConflict;
}

// Whether preflight should block Launch: a usable report that says not-ready.
// An unavailable report never blocks (Launch behaves as before).
export function preflightBlocks(pf) {
  return !!pf && !pf.unavailable && !pf.ready;
}
