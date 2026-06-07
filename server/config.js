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

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT || 8787);

export function projectById(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}
