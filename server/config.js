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
];

export const PROJECTS = candidates
  .filter((dir) => existsSync(path.join(dir, '.night-shift')))
  .map((dir) => ({ id: path.basename(dir), root: dir }));

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT || 8787);

export function projectById(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}
