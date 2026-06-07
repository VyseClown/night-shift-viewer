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

Configure which projects to scan in `server/config.js` (defaults to the sibling
`rn-sandbox` and `web-app`, whichever exist).

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

## Status

- [x] Phase 0 — scaffold + read-API (runs list, run detail) against the real archive
- [x] Phase 1 — dashboards (gates, counters, persona matrix, observer, evidence)
- [x] Phase 2 — diff viewer with `base..HEAD → base..candidate → stored .patch` fallback
- [x] Phase 3 — live monitoring (auto-refresh while running) + launch control (dry-run/fixture/real, gated)
