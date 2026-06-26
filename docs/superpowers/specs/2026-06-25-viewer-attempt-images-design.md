# Viewer per-attempt progression images — design

Date: 2026-06-25. Repo: `night-shift-viewer` (web). Increment **B** of the
visual-repair audit trail — the engine increment A (engine PR #32) now emits, per
screen, an `attempts[]` array where each entry has a `screenshot` + `diff_image` path
(a baseline "before" at `attempt: 1`, then each repair attempt), an `analysis`
("what changed"), `diff_pct`, and `pass`. This makes the viewer **show** that
progression as images.

## 1. Scope (web-only)

The viewer **server already resolves** the per-attempt image URLs: `screenView`
(`server/src/runs.js`) maps every `attempts[]` entry to `{ attempt, diff_pct, pass,
analysis, screenshotUrl, diffImageUrl }`, where `screenshotUrl`/`diffImageUrl` are
minted only when the file resolves on disk (else `null`). **No server change.**

The only gap is the web component: `VvAttempts` (`web/src/VisualValidation.jsx`)
renders attempts as **text only** (number · `diff_pct`% · pass/fail · analysis) and
ignores the `screenshotUrl`/`diffImageUrl` it is already handed. This increment makes
each attempt row also show a compact **implementation + diff-overlay** thumbnail pair.

## 2. Pure helper (testable) — `web/src/visualAttempts.js`

Following the repo's established pattern (pure logic in a module, tested with
`node --test`; components stay thin — cf. `src/personaEdits.js`, the readiness
mappers), extract the per-attempt image decision into a pure function:

```js
// Returns the thumbnails to render for one attempt: an entry per image URL that
// the server actually resolved (null URLs omitted). Empty array => render no image
// row (e.g. older reports whose per-attempt images don't resolve).
export function attemptThumbnails(attempt) {
  const out = [];
  if (attempt?.screenshotUrl) out.push({ url: attempt.screenshotUrl, label: 'impl' });
  if (attempt?.diffImageUrl)  out.push({ url: attempt.diffImageUrl,  label: 'diff' });
  return out;
}
```

This is the unit under test. It is total (handles `null`/missing fields), order-stable
(impl before diff), and never returns a `null`-url entry.

## 3. `VvAttempts` rendering (`web/src/VisualValidation.jsx`)

Each attempt `<li>` keeps its current text line, and — when
`attemptThumbnails(a).length > 0` — gains a compact image row beneath it rendered with
the **existing `VvImage`** component (which already shows a graceful fallback):

```jsx
{attemptThumbnails(a).length > 0 && (
  <div className="vv-attempt-images">
    {attemptThumbnails(a).map((t) => (
      <VvImage key={t.label} url={t.url} label={t.label} alt={`attempt ${a.attempt} ${t.label}`} />
    ))}
  </div>
)}
```

It stays inside the existing collapsible `<details>Attempts (N)</details>`, so the
progression is opt-in to expand. Expanding now shows **before (attempt 1) → each
repair → best**, each with its screenshot, diff overlay, `diff_pct`%, pass/fail, and
the "what changed" analysis. No change to `VvScreen`'s top-level images (still the
best attempt's reference / implementation / diff).

## 4. CSS (`web/src/styles.css`)

Add a `vv-attempt-images` rule: a flex row of **thumbnail-sized** figures (noticeably
smaller than the top-level `vv-img`, e.g. a fixed small max-width), reusing the
existing `vv-figure`/`vv-figcap` styles. Compact so a 4–6 step progression stays
readable in the collapsible list.

## 5. Degradation / back-compat

- **Older reports** (pre-increment-A) have attempts whose per-attempt image paths
  don't resolve → `screenshotUrl`/`diffImageUrl` are `null` → `attemptThumbnails`
  returns `[]` → **no image row**, text-only (today's behavior). No regression.
- A partially-resolved attempt (one URL present) shows the one thumbnail it has.
- Invalid/unparseable report handling is unchanged (still flagged, never a pass).

## 6. Testing

`web/test/visualAttempts.test.js` (`node --test`, pure — no DOM, matching
`personaEdits.test.js`/`readiness.test.js`):
- both URLs present → 2 thumbnails, `impl` first then `diff`, urls preserved;
- only `screenshotUrl` → 1 thumbnail (`impl`); only `diffImageUrl` → 1 (`diff`);
- neither (older report) / missing attempt fields / `null` → `[]`.

The JSX wiring in `VvAttempts` is a thin map over the tested helper (the repo does not
DOM-render components in tests). `node --test test/*.test.js` stays green;
`npm run build` (vite) still succeeds.

## 7. Non-goals

- No server change (URLs already resolved).
- No new layout mode (filmstrip/lightbox); just thumbnails in the existing expandable
  rows.
- No schema change; no engine change.
- No `unmet_brief` work (already committed separately on this branch).
