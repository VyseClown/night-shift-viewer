import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// ~/work — the container that holds the sibling project repos (discovery root).
const workspaceRoot = path.resolve(here, '..', '..');
// The engine repo now lives in its own directory under the container (it used to
// BE the container). SCRIPT_PATH/SPECS_DIR/TODO_FILE resolve against this, while
// project discovery still scans workspaceRoot. Override with NSV_ENGINE_DIR.
const engineRoot = process.env.NSV_ENGINE_DIR
  ? path.resolve(process.env.NSV_ENGINE_DIR)
  : path.join(workspaceRoot, 'night-shift-engine');
// The viewer's own repo (a sibling of the targets); excluded from discovery so
// the dashboard never lists or launches night-shift against itself.
const viewerRoot = path.resolve(here, '..');

// A `.gitignore` opts a repo into night-shift by ignoring the engine's run
// directory — the documented prerequisite ("a target project must gitignore
// .night-shift/"). Match the path with or without leading/trailing slashes.
function gitignoresNightShift(dir) {
  try {
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    return gi.split(/\r?\n/).some((line) => {
      const t = line.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      return t === '.night-shift';
    });
  } catch {
    return false;
  }
}

// Inspect a candidate directory and report its night-shift readiness. Returns
// null when the directory is not a candidate at all (the viewer's own repo, or
// not its own git repo). Otherwise returns
//   { id, root, ready, hasRun, blockers, warnings }
// where `ready` (safe to launch/scan) requires the repo to gitignore
// `.night-shift/` so a run never commits engine artifacts into the project repo,
// and `warnings` are non-blocking notes (e.g. no CLAUDE.md → the engine uses its
// default validation commands). Not-ready repos are kept (with their blockers) so
// the UI can surface them with the fix instead of hiding them silently.
export function inspectRepo(dir) {
  if (dir === viewerRoot) return null; // never the dashboard itself
  if (dir === engineRoot) return null; // never the engine repo itself
  if (!existsSync(path.join(dir, '.git'))) return null; // must be its own repo
  const hasRun = existsSync(path.join(dir, '.night-shift'));
  const blockers = [];
  const warnings = [];
  if (!gitignoresNightShift(dir)) {
    blockers.push(
      'does not gitignore `.night-shift/` — a run would commit engine artifacts into the project repo',
    );
  }
  if (!existsSync(path.join(dir, 'CLAUDE.md'))) {
    warnings.push('no CLAUDE.md — the engine falls back to default validation commands');
  }
  return { id: path.basename(dir), root: dir, ready: blockers.length === 0, hasRun, blockers, warnings };
}

// Scan a workspace root for candidate repos (its own git-repo subdirs), each
// annotated with readiness. READ-ONLY: the viewer never writes into them. Sorted
// by id. Includes not-ready repos so the launcher can surface them.
export function discoverRepos(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => inspectRepo(path.join(root, e.name)))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Backward-compatible boolean: a repo the viewer should scan for runs — either
// ready (opted in) or carrying existing run data so its history stays visible.
export function isNightShiftProject(dir) {
  const r = inspectRepo(dir);
  return !!r && (r.ready || r.hasRun);
}

// Backward-compatible: the absolute paths of scannable projects, sorted.
export function discoverProjects(root) {
  return discoverRepos(root)
    .filter((r) => r.ready || r.hasRun)
    .map((r) => r.root);
}

// Discovery is automatic. An explicit override (path-delimiter–separated absolute
// paths in NSV_PROJECT_DIRS) bypasses the scan — useful for tests or for pointing
// the viewer at projects outside ~/work.
const override = process.env.NSV_PROJECT_DIRS;
const repos = override
  ? override
      .split(path.delimiter)
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => path.resolve(d))
      .filter(existsSync)
      .map(inspectRepo)
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id))
  : discoverRepos(workspaceRoot);

// Every discovered candidate with its readiness (drives the launcher's repo
// panel, which surfaces not-ready repos and how to fix them).
export const REPOS = repos;

// A project is launchable/scannable when it is ready, or already has run data so
// its history stays visible. Runs only appear once it has a .night-shift/
// (listRuns handles the empty case gracefully).
export const PROJECTS = repos
  .filter((r) => r.ready || r.hasRun)
  .map((r) => ({ id: r.id, root: r.root }));

export const SPECS_DIR = path.join(engineRoot, 'specs');
export const TODO_FILE = path.join(engineRoot, 'TODO.md');
export const WORKSPACE_ROOT = workspaceRoot;
export const ENGINE_ROOT = engineRoot;
export const SCRIPT_PATH = path.join(engineRoot, 'scripts', 'night-shift.sh');

// Launching mutates: it spawns night-shift.sh (autonomous agent, commits, cost).
// OFF by default so the server stays read-only; opt in per the env flags.
//   NSV_ALLOW_LAUNCH=1  → enables dry-run + fixture (free / minimal) launches
//   NSV_ALLOW_REAL=1    → additionally enables real, paid, multi-hour project runs
export const LAUNCH_ENABLED = process.env.NSV_ALLOW_LAUNCH === '1';
export const REAL_LAUNCH_ENABLED = process.env.NSV_ALLOW_REAL === '1';

// Editing specs mutates files under SPECS_DIR. OFF by default so the viewer stays
// read-only; this is a distinct flag from the launch flags above, so enabling
// editing never implies the ability to launch (paid) runs and vice versa.
//   NSV_ALLOW_EDIT=1 → enables PUT /api/specs/:name (create / overwrite a spec)
export const EDIT_ENABLED = process.env.NSV_ALLOW_EDIT === '1';

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT || 8787);

// Browser origins permitted for CORS and state-changing requests. The server
// binds to localhost and the app reaches it same-origin through the Vite dev
// proxy, so legitimate requests carry the Vite origin (or no Origin at all, for
// curl / server-to-server / tests). Direct browser access to the API port is
// also allowed for convenience.
export const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

// CSRF posture for mutating endpoints. Allowed when the request carries no
// Origin (non-browser caller) or an allow-listed Origin. A browser on a
// malicious page always sends its (disallowed) Origin on a cross-site POST, so
// this blocks drive-by launches while leaving the local dev flow intact.
export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function projectById(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}
