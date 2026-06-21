import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// ~/work — the container that holds the sibling project repos.
const workspaceRoot = path.resolve(here, '..', '..');
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

// A sibling dir is a night-shift target when it is its own git repo AND it has
// opted in — either by gitignoring `.night-shift/` (the documented marker) or by
// already containing a `.night-shift/` run directory (it has been run before).
// This is the predicate the hardcoded candidate list used to stand in for.
export function isNightShiftProject(dir) {
  if (dir === viewerRoot) return false; // never the dashboard itself
  if (!existsSync(path.join(dir, '.git'))) return false; // must be its own repo
  if (existsSync(path.join(dir, '.night-shift'))) return true; // has run data
  return gitignoresNightShift(dir);
}

// Scan a workspace root for night-shift target repos. READ-ONLY: the viewer
// never writes into discovered projects. Returns absolute paths, sorted.
export function discoverProjects(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(root, e.name))
    .filter(isNightShiftProject)
    .sort();
}

// Discovery is automatic. An explicit override (path-delimiter–separated
// absolute paths in NSV_PROJECT_DIRS) bypasses the scan — useful for tests or
// for pointing the viewer at projects outside ~/work.
const override = process.env.NSV_PROJECT_DIRS;
const projectDirs = override
  ? override
      .split(path.delimiter)
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => path.resolve(d))
      .filter(existsSync)
  : discoverProjects(workspaceRoot);

// A project is launchable/scannable once discovered. Runs only appear once it
// has a .night-shift/ (listRuns handles the empty case gracefully).
export const PROJECTS = projectDirs.map((dir) => ({ id: path.basename(dir), root: dir }));

export const SPECS_DIR = path.join(workspaceRoot, 'specs');
export const TODO_FILE = path.join(workspaceRoot, 'TODO.md');
export const WORKSPACE_ROOT = workspaceRoot;
export const SCRIPT_PATH = path.join(workspaceRoot, 'scripts', 'night-shift.sh');

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
