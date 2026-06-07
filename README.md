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

## Status

- [x] Phase 0 — scaffold + read-API (runs list, run detail) against the real archive
- [x] Phase 1 — dashboards (gates, counters, persona matrix, observer, evidence)
- [x] Phase 2 — diff viewer with `base..HEAD → base..candidate → stored .patch` fallback
- [ ] Phase 3 — live SSE polish, multi-run history, finding-stall view
