import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_ROOT,
  SCRIPT_PATH,
  LAUNCH_ENABLED,
  REAL_LAUNCH_ENABLED,
  PROJECTS,
  projectById,
} from '../config.js';

// In-memory registry of launched night-shift processes. This is the ONLY part of
// the server that mutates anything — it spawns the orchestrator. It is gated by
// LAUNCH_ENABLED (and REAL_LAUNCH_ENABLED for paid project runs).
const launches = new Map();
let seq = 0;
const MAX_LOG = 4000; // cap retained lines per launch

export function launchConfig() {
  return {
    enabled: LAUNCH_ENABLED,
    realEnabled: REAL_LAUNCH_ENABLED,
    scriptPresent: existsSync(SCRIPT_PATH),
    scriptPath: SCRIPT_PATH,
    projects: PROJECTS.map((p) => p.id),
  };
}

function publicView(l) {
  return {
    id: l.id,
    mode: l.mode,
    project: l.project,
    spec: l.spec,
    status: l.status,
    exitCode: l.exitCode,
    args: l.args,
    startedAt: l.startedAt,
    endedAt: l.endedAt ?? null,
    logLines: l.log.length,
  };
}

export function listLaunches() {
  return [...launches.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicView);
}

export function getLaunch(id) {
  const l = launches.get(id);
  if (!l) return null;
  return { ...publicView(l), log: l.log };
}

function projectHasLiveRun(root) {
  const f = path.join(root, '.night-shift', 'state.json');
  if (!existsSync(f)) return false;
  try {
    const s = JSON.parse(readFileSync(f, 'utf8'));
    return s.status === 'running' || s.status === 'waiting';
  } catch {
    return false;
  }
}

function attachLineReader(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  stream.on('end', () => {
    if (buf.length) onLine(buf);
  });
}

// Returns { id } on success, or { error, code } on rejection.
export function launchRun({ project, spec, mode } = {}) {
  if (!LAUNCH_ENABLED)
    return { error: 'launching is disabled; start the server with NSV_ALLOW_LAUNCH=1', code: 403 };
  if (!existsSync(SCRIPT_PATH))
    return { error: `night-shift.sh not found at ${SCRIPT_PATH}`, code: 500 };

  mode = mode || 'dry-run';
  const env = { ...process.env };
  let args;

  if (mode === 'dry-run') {
    // Deterministic fixtures only — no model calls, no cost.
    args = ['--fixture-test', '--dry-run'];
  } else if (mode === 'fixture') {
    // Minimal live Claude smoke checks — small but real cost.
    args = ['--fixture-test'];
    env.NIGHT_SHIFT_ACCEPT_COSTS = 'YES';
  } else if (mode === 'real') {
    if (!REAL_LAUNCH_ENABLED)
      return { error: 'real runs are disabled; start the server with NSV_ALLOW_REAL=1', code: 403 };
    const p = projectById(project);
    if (!p) return { error: 'unknown project', code: 400 };
    if (projectHasLiveRun(p.root))
      return { error: 'this project already has a live run (one run per project)', code: 409 };
    args = ['--project', p.root];
    if (spec) {
      if (!/^[A-Za-z0-9._/-]+\.md$/.test(spec) || spec.includes('..'))
        return { error: 'invalid spec path', code: 400 };
      args.push('--spec', spec);
    }
    env.NIGHT_SHIFT_ACCEPT_COSTS = 'YES';
  } else {
    return { error: `unknown mode: ${mode}`, code: 400 };
  }

  const id = `L${Date.now()}-${++seq}`;
  const child = spawn('bash', [SCRIPT_PATH, ...args], {
    cwd: WORKSPACE_ROOT,
    env,
  });
  const l = {
    id,
    mode,
    project: project ?? null,
    spec: spec ?? null,
    args,
    status: 'running',
    exitCode: null,
    startedAt: new Date().toISOString(),
    log: [],
    subscribers: new Set(),
    child,
  };
  launches.set(id, l);

  const emit = (line) => {
    l.log.push(line);
    if (l.log.length > MAX_LOG) l.log.shift();
    for (const fn of l.subscribers) fn({ type: 'line', line });
  };
  attachLineReader(child.stdout, emit);
  attachLineReader(child.stderr, emit);
  child.on('error', (e) => emit(`[viewer] spawn error: ${e.message}`));
  child.on('exit', (code, signal) => {
    l.status = signal === 'SIGTERM' ? 'stopped' : 'exited';
    l.exitCode = code;
    l.endedAt = new Date().toISOString();
    for (const fn of l.subscribers)
      fn({ type: 'status', status: l.status, exitCode: code });
  });

  return { id, mode, status: 'running' };
}

export function stopRun(id) {
  const l = launches.get(id);
  if (!l || l.status !== 'running') return false;
  // SIGTERM → the script's trap runs block_run, which preserves full state.
  l.child.kill('SIGTERM');
  return true;
}

// Subscribe to a launch's live events; returns an unsubscribe fn, or null if the
// launch is unknown.
export function subscribeLaunch(id, fn) {
  const l = launches.get(id);
  if (!l) return null;
  l.subscribers.add(fn);
  return () => l.subscribers.delete(fn);
}
