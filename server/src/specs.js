import { readFile, readdir, writeFile, rename, unlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { SPECS_DIR, TODO_FILE } from '../config.js';
import { listRuns } from './runs.js';

// Longest spec filename we accept (defense against pathological names).
const MAX_NAME_LEN = 128;

// ── Write path (gated by EDIT_ENABLED at the route layer) ──────────────────
// These two functions are PURE validators over an untrusted `:name` and never
// throw — any bad input yields `false` / `null`, never an exception.

// True only when `name` is a safe spec filename: a non-empty `.md` basename with
// no path separators, no `..`, not absolute, and within a sane length.
export function specNameSafe(name) {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MAX_NAME_LEN) return false;
  if (name.includes('..')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (path.isAbsolute(name)) return false;
  // basename must equal the input (no directory component snuck in)
  if (path.basename(name) !== name) return false;
  // allow-list: letters/digits/dot/dash/underscore, must end in .md with a
  // non-empty base (so ".md" alone is rejected).
  return /^[A-Za-z0-9._-]+\.md$/.test(name) && name !== '.md';
}

// Returns the absolute on-disk path for `name`, strictly confined to the real
// SPECS_DIR (defense in depth against a symlinked specs dir), or `null`. Never
// throws — a missing SPECS_DIR or any fs error yields `null`.
export function resolveSpecPath(name) {
  try {
    if (!specNameSafe(name)) return null;
    const realDir = realpathSync(SPECS_DIR);
    const resolved = path.join(realDir, name);
    if (resolved !== realDir && resolved.startsWith(realDir + path.sep)) {
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
}

// Atomically write `content` to SPECS_DIR/<name>: write a temp file in the same
// directory, then rename it onto the target (rename is atomic within one
// filesystem, so readers never see a partial file; an existing spec is
// overwritten and a new one is created). Throws on an unsafe name or fs error;
// the route layer validates first and maps any throw to a 5xx without leaking
// paths. On failure the temp file is best-effort removed.
export async function saveSpec(name, content) {
  const target = resolveSpecPath(name);
  if (!target) throw new Error('unsafe spec name');
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${name}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return { ok: true, name };
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function parseMeta(text, filename) {
  const lines = text.split('\n');

  // title: first ^# (.+) line
  const titleLine = lines.find((l) => /^# .+/.test(l));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : filename.replace(/\.md$/, '');

  // track: ^- Track: (.*) → lowercased/stripped; default "rn"
  const trackMatch = text.match(/^- Track:\s*(.*)/m);
  const track = trackMatch ? trackMatch[1].trim().toLowerCase() : 'rn';

  // reviewProfile: ^- Review Profile: (.*) → lowercased/stripped; null if absent
  const rpMatch = text.match(/^- Review Profile:\s*(.*)/m);
  const reviewProfile = rpMatch ? rpMatch[1].trim().toLowerCase() : null;

  // projectPath: ^- Project path: `([^`]+)`
  const ppMatch = text.match(/^- Project path:\s*`([^`]+)`/m);
  const projectPath = ppMatch ? ppMatch[1] : null;

  // baseBranch: ^- Base branch: `([^`]+)`
  const bbMatch = text.match(/^- Base branch:\s*`([^`]+)`/m);
  const baseBranch = bbMatch ? bbMatch[1] : null;

  // featureBranch: ^- Feature branch: `([^`]+)`
  const fbMatch = text.match(/^- Feature branch:\s*`([^`]+)`/m);
  const featureBranch = fbMatch ? fbMatch[1] : null;

  return { title, track, reviewProfile, projectPath, baseBranch, featureBranch };
}

async function parseTodo() {
  const text = await readText(TODO_FILE);
  if (!text) return {};
  const map = {};
  // ^- \[( |x)\] (bug|feature): (.*) \(`(specs/[^`]+)`\)
  const re = /^- \[( |x)\] (bug|feature): (.*) \(`(specs\/[^`]+)`\)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, checkChar, type, description, specPath] = m;
    // specPath is like "specs/toggle-todo.md" — strip the path and .md
    const basename = path.basename(specPath).replace(/\.md$/, '');
    map[basename] = {
      listed: true,
      type,
      checked: checkChar === 'x',
      description: description.trim(),
    };
  }
  return map;
}

export async function listSpecs() {
  let files = [];
  try {
    const entries = await readdir(SPECS_DIR, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
  } catch {
    return [];
  }

  const todoMap = await parseTodo();
  const allRuns = await listRuns();

  const specs = [];
  for (const filename of files) {
    const name = filename.replace(/\.md$/, '');
    const filePath = path.join(SPECS_DIR, filename);
    const text = await readText(filePath);
    if (text === null) continue;

    const meta = parseMeta(text, filename);
    const isTemplate = filename.startsWith('_template');
    const todo = todoMap[name] ?? null;

    // runs where taskName matches this spec name (listRuns already newest-first)
    const specRuns = allRuns.filter((r) => r.taskName === name);
    const runStatus = specRuns.length > 0 ? specRuns[0].status : 'none';

    specs.push({
      name,
      file: filename,
      path: filePath,
      title: meta.title,
      track: meta.track,
      reviewProfile: meta.reviewProfile,
      projectPath: meta.projectPath,
      baseBranch: meta.baseBranch,
      featureBranch: meta.featureBranch,
      isTemplate,
      todo,
      runs: specRuns.map((r) => ({
        project: r.project,
        runId: r.runId,
        status: r.status,
        startedAt: r.startedAt,
      })),
      runStatus,
    });
  }

  return specs;
}

export async function loadSpec(name) {
  // Security: validate name
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) return null;

  // Strip trailing .md if present, then re-append
  const base = name.replace(/\.md$/, '');
  const filename = base + '.md';
  const resolved = path.join(SPECS_DIR, filename);

  // Verify resolved path stays inside SPECS_DIR (no traversal)
  if (!resolved.startsWith(SPECS_DIR + path.sep) && resolved !== SPECS_DIR) {
    return null;
  }

  const text = await readText(resolved);
  if (text === null) return null;

  const meta = parseMeta(text, filename);
  const todoMap = await parseTodo();
  const todo = todoMap[base] ?? null;
  const allRuns = await listRuns();
  const specRuns = allRuns.filter((r) => r.taskName === base);

  return {
    name: base,
    file: filename,
    path: resolved,
    meta,
    markdown: text,
    todo,
    runs: specRuns.map((r) => ({
      project: r.project,
      runId: r.runId,
      status: r.status,
      startedAt: r.startedAt,
    })),
  };
}
