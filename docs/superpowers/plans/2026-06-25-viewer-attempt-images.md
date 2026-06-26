# Viewer Per-Attempt Progression Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show the visual-repair progression (baseline "before" → each attempt → best) as image thumbnails in the viewer's "Attempts" section, instead of text only.

**Architecture:** Web-only. The server already resolves each attempt's `screenshotUrl`/`diffImageUrl`. Extract the per-attempt image decision into a pure, `node --test`-tested helper (`web/src/visualAttempts.js`), and have `VvAttempts` (`web/src/VisualValidation.jsx`) render a compact impl+diff thumbnail row from it via the existing `VvImage`, with a `vv-attempt-images` CSS rule.

**Tech Stack:** React 19 + Vite (web). Tests = `node --test test/*.test.js` (pure logic, no DOM — matching `web/test/personaEdits.test.js`).

**Spec:** `docs/superpowers/specs/2026-06-25-viewer-attempt-images-design.md`.

## Global Constraints

- Work in the `night-shift-viewer` repo, branch `feat/viewer-attempt-images` (off `main`; already carries the `unmet_brief` commit). All paths below are relative to the repo root.
- **No server change** (the per-attempt URLs are already resolved in `server/src/runs.js`). **No schema/engine change.**
- The helper must be **total**: `null`/missing attempt or `null` URLs → `[]` (older reports stay text-only — no regression).
- Web tests run from `web/`: `npm test` (= `node --test test/*.test.js`). The production build must still pass: `npm run build`.
- Follow the repo pattern: pure logic in a module + `node --test`; the JSX component stays a thin map over the helper (components are not DOM-rendered in tests).

## File Structure

- **Create** `web/src/visualAttempts.js` — the pure `attemptThumbnails` helper.
- **Create** `web/test/visualAttempts.test.js` — its `node --test` tests.
- **Modify** `web/src/VisualValidation.jsx` — import the helper; render the thumbnail row in `VvAttempts`.
- **Modify** `web/src/styles.css` — add the `.vv-attempt-images` rule.

---

### Task 1: Per-attempt thumbnails (helper + render + style)

**Files:**
- Create: `web/src/visualAttempts.js`, `web/test/visualAttempts.test.js`
- Modify: `web/src/VisualValidation.jsx`, `web/src/styles.css`

**Interfaces:**
- Produces: `attemptThumbnails(attempt) -> Array<{ url: string, label: 'impl' | 'diff' }>` — one entry per resolved URL (`screenshotUrl`→`impl` first, `diffImageUrl`→`diff`); `[]` when neither resolves or the attempt is nullish.

- [ ] **Step 1: Write the failing test.** Create `web/test/visualAttempts.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attemptThumbnails } from '../src/visualAttempts.js';

test('both URLs -> impl then diff, urls preserved', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: '/a.png', diffImageUrl: '/b.png' }),
    [{ url: '/a.png', label: 'impl' }, { url: '/b.png', label: 'diff' }],
  );
});

test('only screenshot -> single impl thumbnail', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: '/a.png', diffImageUrl: null }),
    [{ url: '/a.png', label: 'impl' }],
  );
});

test('only diff -> single diff thumbnail', () => {
  assert.deepEqual(
    attemptThumbnails({ screenshotUrl: null, diffImageUrl: '/b.png' }),
    [{ url: '/b.png', label: 'diff' }],
  );
});

test('neither resolved (older report) -> empty', () => {
  assert.deepEqual(attemptThumbnails({ screenshotUrl: null, diffImageUrl: null }), []);
});

test('missing fields / nullish attempt -> empty', () => {
  assert.deepEqual(attemptThumbnails({}), []);
  assert.deepEqual(attemptThumbnails(null), []);
  assert.deepEqual(attemptThumbnails(undefined), []);
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `cd /Users/alessandrogentil/work/night-shift-viewer/web && npm test 2>&1 | tail -20`
Expected: the `visualAttempts` tests error (module `../src/visualAttempts.js` not found / `attemptThumbnails` is not a function).

- [ ] **Step 3: Write the helper.** Create `web/src/visualAttempts.js`:

```js
// Pure: the thumbnails to render for one repair attempt — one entry per image URL
// the server actually resolved (null/absent omitted), `impl` (screenshot) before
// `diff` (overlay). Empty array => render no image row (e.g. older reports whose
// per-attempt images don't resolve). Total: tolerates a nullish attempt.
export function attemptThumbnails(attempt) {
  const out = [];
  if (attempt?.screenshotUrl) out.push({ url: attempt.screenshotUrl, label: 'impl' });
  if (attempt?.diffImageUrl) out.push({ url: attempt.diffImageUrl, label: 'diff' });
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `cd /Users/alessandrogentil/work/night-shift-viewer/web && npm test 2>&1 | tail -8`
Expected: all tests pass (the 5 new `visualAttempts` tests + the existing suite), `fail 0`.

- [ ] **Step 5: Wire `VvAttempts` to render the thumbnails.** In `web/src/VisualValidation.jsx`:

(a) Add the import at the top of the file, immediately after the header comment block (the file currently has no imports — React 19 + Vite uses the automatic JSX runtime):

```jsx
import { attemptThumbnails } from './visualAttempts.js';
```

(b) Replace the entire `VvAttempts` function with:

```jsx
function VvAttempts({ attempts }) {
  if (!attempts?.length) return null;
  return (
    <details className="vv-attempts">
      <summary>Attempts ({attempts.length})</summary>
      <ol className="vv-attempt-list">
        {attempts.map((a) => {
          const thumbs = attemptThumbnails(a);
          return (
            <li key={a.attempt} className="vv-attempt">
              <span className={a.pass ? 'exit-ok' : 'exit-bad'}>
                {a.attempt}. {a.diff_pct}% {a.pass ? 'pass' : 'fail'}
              </span>
              {a.analysis && <span className="vv-attempt-analysis"> — {a.analysis}</span>}
              {thumbs.length > 0 && (
                <div className="vv-attempt-images">
                  {thumbs.map((t) => (
                    <VvImage key={t.label} url={t.url} label={t.label} alt={`attempt ${a.attempt} ${t.label}`} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
```

(`VvImage` is already defined above `VvAttempts` in the same file — no import needed for it.)

- [ ] **Step 6: Add the CSS.** In `web/src/styles.css`, immediately after the `.vv-noimg { … }` rule block (the last `.vv-*` image rule), add:

```css
.vv-attempt-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0 8px;
}
.vv-attempt-images .vv-figure { max-width: 130px; }
```

- [ ] **Step 7: Verify tests + build.**

Run: `cd /Users/alessandrogentil/work/night-shift-viewer/web && npm test 2>&1 | tail -6` → Expected: `fail 0`.
Run: `cd /Users/alessandrogentil/work/night-shift-viewer/web && npm run build 2>&1 | tail -5` → Expected: a successful Vite build (no JSX/import errors; "built in …").

- [ ] **Step 8: Commit.**

```bash
cd /Users/alessandrogentil/work/night-shift-viewer
git add web/src/visualAttempts.js web/test/visualAttempts.test.js web/src/VisualValidation.jsx web/src/styles.css
git commit -m "feat(viewer): render per-attempt repair progression images in the Attempts panel"
```

---

## Self-Review

**Spec coverage:** §2 pure helper → Step 3 (+ Step 1 test); §3 `VvAttempts` render via `VvImage` inside the collapsible section → Step 5; §4 CSS → Step 6; §5 back-compat (null URLs → no row) → the helper's `[]` path + the `thumbs.length > 0` guard, tested in Step 1; §6 testing (both/one/none) → Step 1; §7 non-goals (no server/schema change) → respected (no server files touched).

**Placeholder scan:** every step has complete code + exact commands/expected output. No TBD/TODO.

**Type/name consistency:** `attemptThumbnails`, the `{ url, label }` shape, the `'impl'`/`'diff'` labels, and the `./visualAttempts.js` import path are identical across the helper, its test, and `VvAttempts`. `VvImage`'s props (`url`, `label`, `alt`) match its existing definition in `VisualValidation.jsx`.

**Pattern fit:** mirrors `web/test/personaEdits.test.js` (pure import + `node:test` + `node:assert/strict`); the component stays a thin map over the tested helper, as the repo does.
