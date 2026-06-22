# night-shift-viewer

A **local, read-only** web app that visualizes the output of the night-shift
overnight agent workflow: run state, the persona/observer review pipeline,
validation evidence, and per-file git diffs.

It **never modifies** the projects it reads, the `.night-shift/` data, or the
`night-shift.sh` orchestrator. It only reads `.night-shift/` directories from
sibling project repos and runs read-only `git` commands for diffs.

> The authoritative model of the workflow this tool visualizes is captured in
> [`WORKFLOW.md`](./WORKFLOW.md), verified against `night-shift.sh` and a real
> archived run. The data contracts are vendored in [`schemas/`](./schemas).

## Architecture

```
 <project>/.night-shift/            ← read-only data source (rn-sandbox, web-app, …)
        │
        ▼
 server/   Hono read-API, bound to 127.0.0.1 only
   GET /api/runs                       list runs across configured projects
   GET /api/runs/:project/:runId       full run detail (state, reviews, evidence)
   GET /api/runs/:project/:runId/diff  structured per-file diff (fallback chain)
   GET /api/specs                      list specs; GET /api/specs/:name spec detail
   GET /api/optional-personas          read-only manifest of optional review personas (from engine)
   GET /api/preflight                  read-only launch-readiness report (execs engine --preflight)
   PUT /api/specs/:name                save a spec (gated by NSV_ALLOW_EDIT; off by default)
   POST /api/prepare                   checkout/create the spec's feature branch (gated by NSV_ALLOW_LAUNCH)
   GET /api/events                     SSE: live state.json changes (chokidar)
        │
        ▼
 web/     Vite + React dashboard (@git-diff-view/react for diffs)
```

## Run it

Two packages, two installs. From this directory:

```sh
# 1. API (terminal 1)
cd server && npm install && npm run dev      # → http://127.0.0.1:8787

# 2. Dashboard (terminal 2)
cd web && npm install && npm run dev         # → http://127.0.0.1:5173 (proxies /api → 8787)
```

Projects are **auto-discovered**: any sibling repo under `~/work` that is its own
git repo and has opted in — by gitignoring `.night-shift/` (the documented
prerequisite) or by already having a `.night-shift/` run dir — is scanned. The
viewer's own repo is excluded. Set `NSV_PROJECT_DIRS=/abs/a:/abs/b` to bypass
discovery with an explicit list. See `discoverProjects` in `server/config.js`.

Repos that are discovered but **not yet ready** (e.g. they don't gitignore
`.night-shift/`) are not hidden — the launcher surfaces them with their blockers
so you can see what to fix, rather than silently dropping them.

## Launching runs (opt-in, macOS)

The server is **read-only by default**. To enable the **Launch** tab — which spawns
`night-shift.sh` and streams it live — start it with the launch flags. These
scripts also wrap the process in `caffeinate -i` so the Mac won't idle-sleep mid
run (macOS only):

```sh
cd server
npm run dev:launch   # enables dry-run + fixture (free / minimal) launches
npm run dev:real     # additionally enables real, paid, multi-hour project runs
```

- `dev:launch` → `NSV_ALLOW_LAUNCH=1` (dry-run is free and needs no confirm).
- `dev:real` → also `NSV_ALLOW_REAL=1` (real runs consume usage/billing, run
  autonomously, and require an in-UI confirm; refused if the project already has
  a live run).
- Plain `npm run dev` keeps everything read-only — no Launch tab.

The API binds to `127.0.0.1` only. CORS is reflected for the Vite origin (no
wildcard), and the mutating launch endpoints (`POST /api/launch`,
`POST /api/launch/:id/stop`) reject any request carrying a non-allow-listed
`Origin`, so another website cannot trigger a costly run even when launch is
enabled. Non-browser callers (curl, tests) send no `Origin` and are allowed.

### Launch readiness (preflight + Prepare)

Before a run, the launcher shows a **readiness checklist** for the selected
(project, spec). It is built from `GET /api/preflight`, an **ungated, read-only**
endpoint that shells out to the engine's `night-shift.sh --preflight` (the single
source of truth) and degrades to `{ unavailable: true }` on an older engine.
The checklist covers: spec valid, on the spec's feature branch, working tree
clean, `.night-shift/` gitignored, and no worktree conflict.

When the only thing missing is the branch, a **Prepare** button posts to
`POST /api/prepare`, which checks out (or creates) the spec's feature branch. It
is the launcher's single readiness *mutation*: gated by `NSV_ALLOW_LAUNCH`,
guarded by the same CSRF `Origin` check as launch, and it refuses a dirty tree or
worktree conflict (`409`) rather than touching uncommitted work.

## Editing specs (opt-in)

The viewer is **read-only by default** and the spec editor is hidden. Start the
server with `NSV_ALLOW_EDIT=1` to enable creating and editing spec markdown from
the **Specs** tab (an **Edit** toggle on a spec, and a **New spec** affordance):

```sh
cd server
NSV_ALLOW_EDIT=1 npm run dev
```

- The flag is surfaced to the UI as `editEnabled` on the launch config (via
  `GET /api/launch/config`); when it is off, no editor is shown.
- It is **distinct from the launch flags** — enabling editing does not enable
  launching, and vice versa.
- The only write surface is `PUT /api/specs/:name`:
  - `name` must be a safe `.md` basename (no path separators, no `..`, not
    absolute, sane length); the path is re-confined to the engine's `specs/`
    directory. The body is the raw markdown (capped at 256 KB).
  - Responses: `200 {ok:true, name}`; `403` when editing is disabled; `403` for a
    disallowed `Origin` (the same CSRF guard the launch endpoints use); `400` for
    an unsafe name or an empty / oversized body.
  - Writes are **atomic** (temp file + rename) and confined to `specs/`; an
    existing name is overwritten, a new name is created. Spec content is never
    executed — it is plain markdown persisted for a later night-shift run.

### Optional review persona toggles

When editing a spec, an **"Optional review personas"** checkbox panel appears
above the textarea (only in edit mode with `NSV_ALLOW_EDIT=1`). It is fed by
`GET /api/optional-personas`, a **read-only, ungated** endpoint that shells out
to `night-shift.sh --list-optional-personas` and caches the result in memory
(success only). On failure or an older engine without the flag, the endpoint
returns `{ optional_personas: [], unavailable: true }` and the panel is hidden
— the editor behaves exactly as before.

Each persona checkbox:

- **Checked** when the persona is listed in `- Optional reviewers:` **or** is
  active via its `## <…> Contract` section heading.
- **Checked + disabled** when active only via its section (the field cannot
  override a section-activated persona).
- Toggling **on** adds the persona to the `- Optional reviewers:` field and
  inserts a placeholder documentation-ownership line under
  `- Documentation owned by each review persona:` (if the section exists and
  the line is missing). If the section is absent, an inline warning fires.
- Toggling **off** removes the persona from the field; ownership lines are
  left in place (harmless to `validate_spec`).
- The textarea remains the single source of truth; all edits are saved through
  the existing `PUT /api/specs/:name` path.

## Status

- [x] Phase 0 — scaffold + read-API (runs list, run detail) against the real archive
- [x] Phase 1 — dashboards (gates, counters, persona matrix, observer, evidence)
- [x] Phase 2 — diff viewer with `base..HEAD → base..candidate → stored .patch` fallback
- [x] Phase 3 — live monitoring (auto-refresh while running) + launch control (dry-run/fixture/real, gated)
- [x] Phase 4 — launch-readiness preflight + Prepare, auto-discovery, gated in-viewer spec editor with optional-persona toggles
