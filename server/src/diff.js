import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { simpleGit } from 'simple-git';
import parseDiff from 'parse-diff';
import { projectById } from '../config.js';

// Only commit-ish characters — never let request input reach the shell. simple-git
// passes args as an array (no interpolation), but we validate anyway (WORKFLOW §6).
const REF_RE = /^[A-Za-z0-9_.\-/]{1,200}$/;
const isRef = (r) => typeof r === 'string' && REF_RE.test(r);

function shape(rawDiff, source, note) {
  const files = parseDiff(rawDiff).map((f) => ({
    from: f.from,
    to: f.to,
    isBinary: f.binary ?? false,
    isRename: f.from && f.to && f.from !== f.to,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    // Raw unified text per file, so the frontend diff component can render it
    // directly (WORKFLOW §6 / research: @git-diff-view eats raw git diff text).
    raw: rebuildFileDiff(f, rawDiff),
  }));
  return { source, note, raw: rawDiff, files };
}

// parse-diff drops the leading "diff --git" header from chunks; for the viewer we
// just hand the whole raw diff to the client and let it split. Keep per-file raw
// as a best-effort slice for components that want one file at a time.
function rebuildFileDiff(f) {
  const header =
    f.from || f.to
      ? `diff --git a/${f.from ?? f.to} b/${f.to ?? f.from}\n`
      : '';
  const chunks = (f.chunks ?? [])
    .map((c) => [c.content, ...c.changes.map((ch) => ch.content)].join('\n'))
    .join('\n');
  return header + chunks + '\n';
}

async function tryGitDiff(git, range) {
  try {
    const raw = await git.diff([range, '-M', '--no-color', '--unified=3']);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

async function objectExists(git, ref) {
  try {
    const t = await git.raw(['cat-file', '-t', ref]);
    return t.trim() === 'commit';
  } catch {
    return false;
  }
}

// Implements the §6 fallback chain:
//   1. base..HEAD (always works)         when no explicit candidate, or as primary
//   2. base..<candidate> (GC-aware)      when a specific candidate is requested
//   3. stored validated/*.patch          git-independent fallback
export async function buildDiff(projectId, runId, { base, candidate } = {}) {
  const project = projectById(projectId);
  if (!project) return { error: 'unknown project' };
  if (base && !isRef(base)) return { error: 'invalid base ref' };
  if (candidate && !isRef(candidate)) return { error: 'invalid candidate ref' };

  const git = simpleGit(project.root);
  const baseRef = base || 'HEAD~1';

  // Preferred: explicit candidate if it still exists in the object store.
  if (candidate && (await objectExists(git, candidate))) {
    const raw = await tryGitDiff(git, `${baseRef}..${candidate}`);
    if (raw) {
      const reachable = await isReachable(git, candidate);
      return shape(
        raw,
        'git:base..candidate',
        reachable ? null : 'candidate is a dangling/superseded commit',
      );
    }
  }

  // Always-works: base..HEAD.
  const headRaw = await tryGitDiff(git, `${baseRef}..HEAD`);
  if (headRaw) return shape(headRaw, 'git:base..HEAD', null);

  // Last resort: a stored patch artifact (primary-authored, may be absent).
  const patch = await loadStoredPatch(project.root, runId);
  if (patch) return shape(patch.text, `patch:${patch.file}`, 'from stored patch');

  return { error: 'no diff available (no reachable commits, no stored patch)' };
}

async function isReachable(git, ref) {
  try {
    // Branch/tag tips that contain this commit; empty ⇒ dangling.
    const out = await git.raw(['branch', '--all', '--contains', ref]);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

async function loadStoredPatch(projectRoot, runId) {
  const candidates = [
    path.join(projectRoot, '.night-shift', 'archive', runId, 'validated'),
    path.join(projectRoot, '.night-shift', 'validated'),
  ];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const { readdir } = await import('node:fs/promises');
      const files = (await readdir(dir)).filter((f) => f.endsWith('.patch'));
      if (files.length) {
        const file = files[0];
        return { file, text: await readFile(path.join(dir, file), 'utf8') };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
