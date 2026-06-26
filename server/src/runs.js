import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECTS, projectById } from '../config.js';
import { validateVisualDiff, overallPass } from './visualDiff.js';

// Image types the read-only asset route is allowed to serve, with their MIME.
const IMAGE_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// A run lives either in an archive/<run-id>/ dir (finished) or at the top of
// .night-shift/ (live/blocked, no summary.json). Returns the run's base dir.
function archiveDir(project, runId) {
  return path.join(project.root, '.night-shift', 'archive', runId);
}

// Distil a list-view summary from whatever is on disk. summary.json only exists
// for completed runs; otherwise derive the same fields from state.json (§5).
function toSummary(project, runId, isArchived, state, summary) {
  const s = summary || {};
  const st = state || {};
  return {
    project: project.id,
    runId,
    isArchived,
    status: s.status ?? st.status ?? 'unknown',
    stage: st.stage ?? null,
    task: s.task ?? st.task ?? null,
    taskName: basenameSpec(s.task ?? st.task),
    baseCommit: s.base_commit ?? st.base_commit ?? null,
    candidateCommits: s.candidate_commits ?? st.candidate_commits ?? [],
    primaryTurns: s.primary_turns ?? st.primary_turns ?? null,
    reviewRound: s.review_round ?? st.review_round ?? null,
    findingIds: s.finding_ids ?? st.finding_ids ?? [],
    startedAt: s.started_at ?? st.started_at ?? null,
    completedAt: s.completed_at ?? st.completed_at ?? null,
    blockReason: st.block_reason ?? null,
  };
}

function basenameSpec(task) {
  if (!task) return null;
  return path.basename(task).replace(/\.md$/, '');
}

export async function listRuns() {
  const runs = [];
  for (const project of PROJECTS) {
    const ns = path.join(project.root, '.night-shift');
    // Archived (finished) runs.
    const archived = await listDirs(path.join(ns, 'archive'));
    const archivedIds = new Set(archived);
    for (const runId of archived) {
      const dir = archiveDir(project, runId);
      const state = await readJson(path.join(dir, 'state.json'));
      const summary = await readJson(path.join(dir, 'summary.json'));
      runs.push(toSummary(project, runId, true, state, summary));
    }
    // A live/blocked run at the top level (not yet archived).
    const liveState = await readJson(path.join(ns, 'state.json'));
    if (liveState && liveState.run_id && !archivedIds.has(liveState.run_id)) {
      runs.push(toSummary(project, liveState.run_id, false, liveState, null));
    }
  }
  // Newest first.
  runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return runs;
}

// Resolve the on-disk base directory for a (project, runId), archived or live.
// The live fallback only matches when the top-level state.json actually belongs
// to this runId — otherwise an unknown/stale runId would silently read whatever
// run is currently live (the dir is shared; only its run_id distinguishes runs).
// Exported for unit testing (server/test/runResolution.test.js).
export function resolveRunDir(project, runId) {
  const archived = archiveDir(project, runId);
  if (existsSync(archived)) return { dir: archived, isArchived: true };
  const live = path.join(project.root, '.night-shift');
  const liveState = path.join(live, 'state.json');
  if (existsSync(liveState)) {
    try {
      const st = JSON.parse(readFileSync(liveState, 'utf8'));
      if (st && st.run_id === runId) return { dir: live, isArchived: false };
    } catch {
      // Unreadable/partial live state → treat as not found rather than guessing.
    }
  }
  return null;
}

// Read validated/personas/<spec>/<stage>/round-N/*.json into a structured tree.
async function loadPersonas(validatedDir) {
  const root = path.join(validatedDir, 'personas');
  const out = [];
  for (const spec of await listDirs(root)) {
    for (const stage of await listDirs(path.join(root, spec))) {
      for (const round of await listDirs(path.join(root, spec, stage))) {
        const roundDir = path.join(root, spec, stage, round);
        let files = [];
        try {
          files = (await readdir(roundDir)).filter((f) => f.endsWith('.json'));
        } catch {
          /* ignore */
        }
        const reviews = [];
        for (const f of files) {
          const r = await readJson(path.join(roundDir, f));
          if (r) reviews.push(r);
        }
        out.push({
          spec,
          stage, // "plan" | "implementation"
          round, // directory name, e.g. "round-1" (global counter — label by dir)
          roundNumber: Number(String(round).replace(/[^0-9]/g, '')) || null,
          reviews,
        });
      }
    }
  }
  // Order by stage then round number.
  out.sort(
    (a, b) =>
      a.stage.localeCompare(b.stage) || (a.roundNumber ?? 0) - (b.roundNumber ?? 0),
  );
  return out;
}

async function loadValidatedFiles(validatedDir, prefix) {
  const out = [];
  let files = [];
  try {
    files = await readdir(validatedDir);
  } catch {
    return out;
  }
  for (const f of files) {
    if (f.startsWith(prefix) && f.endsWith('.json')) {
      const data = await readJson(path.join(validatedDir, f));
      if (data) out.push({ file: f, data });
    }
  }
  return out;
}

async function listPatches(validatedDir) {
  try {
    return (await readdir(validatedDir)).filter((f) => f.endsWith('.patch'));
  } catch {
    return [];
  }
}

// Resolve a report-relative image path to an on-disk file, READ-ONLY and
// strictly confined to the run directory. Returns { filePath, contentType } or
// null when the path is missing, escapes the run dir, is not a regular file, or
// is not an allowed image type. Image paths are resolved relative to the run's
// `validated/` dir (where the report lives). Used both to mint asset URLs
// (loadVisual) and to serve bytes (resolveRunAsset) so the two always agree.
function resolveImage(validatedDir, runDir, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const ext = path.extname(relPath).toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[ext];
  if (!contentType) return null;
  const target = path.resolve(validatedDir, relPath);
  const base = path.resolve(runDir);
  // Confine: target must be the run dir or strictly inside it (defeats `..`
  // traversal and absolute paths pointing elsewhere).
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  try {
    if (!statSync(target).isFile()) return null;
  } catch {
    return null;
  }
  return { filePath: target, contentType };
}

function assetUrl(project, runId, relPath) {
  const q = new URLSearchParams({ path: relPath });
  return `/api/runs/${encodeURIComponent(project)}/${encodeURIComponent(runId)}/asset?${q.toString()}`;
}

// Build the per-screen view model: pass through the report metadata and add an
// asset URL for each image that actually resolves on disk (else null), so the
// panel only ever requests images that exist — no broken <img>, no false pass.
function screenView(screen, validatedDir, runDir, project, runId) {
  const urlFor = (p) =>
    resolveImage(validatedDir, runDir, p)
      ? assetUrl(project, runId, p)
      : null;
  return {
    screen: screen.screen ?? null,
    state: screen.state ?? null,
    diff_pct: screen.diff_pct ?? null,
    tolerance: screen.tolerance ?? null,
    pass: typeof screen.pass === 'boolean' ? screen.pass : null,
    device: screen.device,
    analysis: screen.analysis ?? '',
    unmet_brief: Array.isArray(screen.unmet_brief) ? screen.unmet_brief : [],
    referenceUrl: urlFor(screen.reference),
    screenshotUrl: urlFor(screen.screenshot),
    diffImageUrl: urlFor(screen.diff_image),
    attempts: Array.isArray(screen.attempts)
      ? screen.attempts.map((a) => ({
          attempt: a.attempt,
          diff_pct: a.diff_pct,
          pass: a.pass,
          analysis: a.analysis ?? '',
          screenshotUrl: urlFor(a.screenshot),
          diffImageUrl: urlFor(a.diff_image),
        }))
      : [],
  };
}

// Every validated/visual-diff-*.json for the run, parsed + validated. Invalid
// or unparseable reports are flagged (never thrown), so one bad file can't break
// the run detail. Returns [] when the run has no visual evidence.
async function loadVisual(validatedDir, runDir, project, runId) {
  let files = [];
  try {
    files = (await readdir(validatedDir))
      .filter((f) => /^visual-diff-.*\.json$/.test(f))
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    const report = await readJson(path.join(validatedDir, file));
    if (report === null) {
      out.push({
        file,
        valid: false,
        errors: ['unreadable or invalid JSON'],
        task: null,
        overallPass: false,
        screens: [],
      });
      continue;
    }
    const { ok, errors } = validateVisualDiff(report);
    const screens =
      ok && Array.isArray(report.screens)
        ? report.screens.map((s) =>
            screenView(s, validatedDir, runDir, project, runId),
          )
        : [];
    out.push({
      file,
      valid: ok,
      errors,
      task: typeof report.task === 'string' ? report.task : null,
      overallPass: ok ? overallPass(report) : false,
      screens,
    });
  }
  return out;
}

export async function loadRun(projectId, runId) {
  const project = projectById(projectId);
  if (!project) return null;
  const resolved = resolveRunDir(project, runId);
  if (!resolved) return null;
  const { dir, isArchived } = resolved;
  const validated = path.join(dir, 'validated');

  const state = await readJson(path.join(dir, 'state.json'));
  const summary = await readJson(path.join(dir, 'summary.json'));

  const observers = await loadValidatedFiles(validated, 'observer-');
  const executions = await loadValidatedFiles(validated, 'execution-');
  const approvedCommit = observers.find((o) => o.data?.status === 'APPROVE')
    ?.data?.candidate_commit ?? null;
  const headCommit =
    state?.candidate ?? state?.candidate_commits?.slice(-1)[0] ?? null;

  return {
    project: project.id,
    projectRoot: project.root,
    runId,
    isArchived,
    summary: toSummary(project, runId, isArchived, state, summary),
    state,
    gates: {
      baseline_complete: state?.baseline_complete ?? null,
      plan_approved: state?.plan_approved ?? null,
      implementation_approved: state?.implementation_approved ?? null,
      candidate_verified: state?.candidate_verified ?? null,
    },
    personas: await loadPersonas(validated),
    visual: await loadVisual(validated, dir, project.id, runId),
    observers: observers.map((o) => o.data),
    evidence: {
      baseline: await readJson(path.join(validated, 'baseline.json')),
      final: await readJson(path.join(validated, 'final.json')),
      testFirstFailing: await readJson(
        path.join(validated, 'test-first-failing.json'),
      ),
      testFirstPassing: await readJson(
        path.join(validated, 'test-first-passing.json'),
      ),
      executions: executions.map((e) => ({ file: e.file, ...e.data })),
    },
    patches: await listPatches(validated),
    diffHint: {
      baseCommit: state?.base_commit ?? summary?.base_commit ?? null,
      headCommit,
      approvedCommit,
      approvedDiffersFromHead:
        approvedCommit && headCommit && approvedCommit !== headCommit,
    },
  };
}

// Resolve a visual-diff image asset for serving, READ-ONLY and confined to the
// run dir. Returns { filePath, contentType } or null. Used by the asset route;
// re-validates confinement independently of loadRun (defense in depth).
export function resolveRunAsset(projectId, runId, relPath) {
  const project = projectById(projectId);
  if (!project) return null;
  const resolved = resolveRunDir(project, runId);
  if (!resolved) return null;
  const validatedDir = path.join(resolved.dir, 'validated');
  return resolveImage(validatedDir, resolved.dir, relPath);
}
