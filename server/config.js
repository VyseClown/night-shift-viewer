import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// ~/work — the container that holds the sibling project repos.
const workspaceRoot = path.resolve(here, '..', '..');

// Projects to scan for a `.night-shift/` directory. Each entry is an absolute
// path to a git project repo. Only existing directories are kept. READ-ONLY:
// the viewer never writes into these.
const candidates = [
  path.join(workspaceRoot, 'rn-sandbox'),
  path.join(workspaceRoot, 'web-app'),
  path.join(workspaceRoot, 'nightshift-demo'),
];

// A project is launchable/scannable if its directory exists. Runs only appear
// once it has a .night-shift/ (listRuns handles the empty case gracefully).
export const PROJECTS = candidates
  .filter((dir) => existsSync(dir))
  .map((dir) => ({ id: path.basename(dir), root: dir }));

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
