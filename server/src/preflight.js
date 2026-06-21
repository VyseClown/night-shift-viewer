import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  WORKSPACE_ROOT,
  SCRIPT_PATH,
  LAUNCH_ENABLED,
  projectById,
} from '../config.js';

// A spec path is accepted only as a workspace-relative `specs/…md` (or similar)
// with no traversal — the same shape launchRun accepts. Returns the confined
// absolute path or null.
function resolveSpec(spec) {
  if (typeof spec !== 'string') return null;
  if (!/^[A-Za-z0-9._/-]+\.md$/.test(spec) || spec.includes('..')) return null;
  const abs = path.resolve(WORKSPACE_ROOT, spec);
  if (abs !== WORKSPACE_ROOT && !abs.startsWith(WORKSPACE_ROOT + path.sep)) return null;
  return abs;
}

// Read `base`/`feature` branch names from a spec's `- Base/Feature branch:` lines.
function specBranches(specAbs) {
  const text = readFileSync(specAbs, 'utf8');
  const base = (text.match(/^- Base branch:\s*`([^`]+)`/m) || [])[1] || null;
  const feature = (text.match(/^- Feature branch:\s*`([^`]+)`/m) || [])[1] || null;
  return { base, feature };
}

// Read-only launch readiness for a (project, spec). Execs the engine's own
// `--preflight` so the report is the single source of truth (CLI and viewer
// agree). Returns the parsed JSON, or `{ unavailable: true }` when the engine
// lacks --preflight or the exec/parse fails — so the UI degrades to today's
// behavior instead of breaking. Validation problems return `{ error, code }`.
export function runPreflight({ project, spec } = {}) {
  const p = projectById(project);
  if (!p) return { error: 'unknown project', code: 400 };
  const specAbs = resolveSpec(spec);
  if (!specAbs) return { error: 'invalid spec path', code: 400 };
  if (!existsSync(specAbs)) return { error: 'spec not found', code: 404 };
  if (!existsSync(SCRIPT_PATH)) return { unavailable: true };

  const r = spawnSync(
    'bash',
    [SCRIPT_PATH, '--preflight', '--project', p.root, '--spec', spec],
    { cwd: WORKSPACE_ROOT, encoding: 'utf8', timeout: 20000 },
  );
  if (r.status !== 0 || !r.stdout) return { unavailable: true };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { unavailable: true };
  }
}

// True when `feature` is checked out in a *different* worktree of this repo —
// mirrors the engine's check_branch_and_worktree guard.
function worktreeConflict(porcelain, projectRoot, feature) {
  const target = `refs/heads/${feature}`;
  let wt = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) wt = line.slice('worktree '.length);
    else if (line.startsWith('branch ')) {
      const b = line.slice('branch '.length);
      if (b === target && wt && path.resolve(wt) !== path.resolve(projectRoot)) return true;
    }
  }
  return false;
}

// The single mutation in the readiness flow: put the project on the spec's
// feature branch (checkout if it exists, else create from base). Gated by
// LAUNCH_ENABLED at the route layer + here; refuses a dirty tree so it never
// disturbs uncommitted work, and a worktree conflict. The engine deliberately
// never creates/switches branches on the run path — this is the one place the
// viewer owns that, and only for the spec's declared base/feature.
export async function prepareBranch({ project, spec } = {}) {
  if (!LAUNCH_ENABLED)
    return { error: 'preparing is disabled; start the server with NSV_ALLOW_LAUNCH=1', code: 403 };
  const p = projectById(project);
  if (!p) return { error: 'unknown project', code: 400 };
  const specAbs = resolveSpec(spec);
  if (!specAbs) return { error: 'invalid spec path', code: 400 };
  if (!existsSync(specAbs)) return { error: 'spec not found', code: 404 };

  let base, feature;
  try {
    ({ base, feature } = specBranches(specAbs));
  } catch {
    return { error: 'cannot read spec', code: 500 };
  }
  if (!base || !feature) return { error: 'spec is missing Base/Feature branch', code: 400 };
  if (base === feature) return { error: 'base and feature branch are identical', code: 400 };

  const git = simpleGit(p.root);
  try {
    const status = await git.status();
    if (!status.isClean())
      return { error: 'working tree is dirty; commit or stash first', code: 409 };

    try {
      const wt = await git.raw(['worktree', 'list', '--porcelain']);
      if (worktreeConflict(wt, p.root, feature))
        return { error: `feature branch ${feature} is checked out in another worktree`, code: 409 };
    } catch {
      /* older git without worktree porcelain — skip the conflict check */
    }

    const branches = await git.branchLocal();
    if (branches.all.includes(feature)) {
      await git.checkout(feature);
    } else {
      await git.checkout(['-b', feature, base]);
    }
  } catch {
    return { error: 'git operation failed', code: 500 };
  }
  return { ok: true, project, base, feature };
}
