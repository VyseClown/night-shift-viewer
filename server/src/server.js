import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import chokidar from 'chokidar';
import { HOST, PORT, PROJECTS, ALLOWED_ORIGINS, isAllowedOrigin, EDIT_ENABLED } from '../config.js';
import { listRuns, loadRun, resolveRunAsset } from './runs.js';
import { listSpecs, loadSpec, saveSpec, specNameSafe } from './specs.js';
import { buildDiff } from './diff.js';
import {
  launchConfig,
  launchRun,
  stopRun,
  getLaunch,
  listLaunches,
  subscribeLaunch,
} from './launch.js';

const app = new Hono();

// Local dev tool: server binds to 127.0.0.1 only. Reflect CORS for allow-listed
// origins only (no wildcard), so a cross-site page cannot read API responses.
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  }
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});

// CSRF guard for state-changing endpoints: reject a request that carries a
// disallowed Origin (a malicious page's drive-by POST). Missing Origin (curl /
// tests / server-to-server) is permitted. Combined with the gated launch flags,
// this prevents another site from triggering a costly localhost run.
const csrfGuard = async (c, next) => {
  if (!isAllowedOrigin(c.req.header('Origin'))) {
    return c.json({ error: 'cross-origin request rejected' }, 403);
  }
  await next();
};

app.get('/api/health', (c) =>
  c.json({ ok: true, projects: PROJECTS.map((p) => p.id) }),
);

app.get('/api/runs', async (c) => c.json({ runs: await listRuns() }));

app.get('/api/specs', async (c) => c.json({ specs: await listSpecs() }));

app.get('/api/specs/:name', async (c) => {
  const spec = await loadSpec(c.req.param('name'));
  if (!spec) return c.json({ error: 'spec not found' }, 404);
  return c.json(spec);
});

// Gated, path-confined write: save markdown to SPECS_DIR/<name>. csrfGuard runs
// first (disallowed Origin → 403), then editing must be enabled (NSV_ALLOW_EDIT),
// the untrusted :name must pass the pure validator, and the body is capped before
// the atomic write. The viewer never writes outside SPECS_DIR and never executes
// spec content. GET /api/specs and GET /api/specs/:name are unchanged.
const MAX_SPEC_BYTES = 256 * 1024;
app.put('/api/specs/:name', csrfGuard, async (c) => {
  if (!EDIT_ENABLED)
    return c.json(
      { error: 'editing is disabled; start the server with NSV_ALLOW_EDIT=1' },
      403,
    );
  const name = c.req.param('name');
  if (!specNameSafe(name)) return c.json({ error: 'unsafe spec name' }, 400);

  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_SPEC_BYTES)
    return c.json({ error: 'spec too large' }, 400);

  const content = await c.req.text();
  if (!content) return c.json({ error: 'empty spec' }, 400);
  if (Buffer.byteLength(content, 'utf8') > MAX_SPEC_BYTES)
    return c.json({ error: 'spec too large' }, 400);

  try {
    await saveSpec(name, content);
    return c.json({ ok: true, name });
  } catch {
    // No path or stack in the body — avoid filesystem disclosure.
    return c.json({ error: 'failed to save spec' }, 500);
  }
});

app.get('/api/runs/:project/:runId', async (c) => {
  const run = await loadRun(c.req.param('project'), c.req.param('runId'));
  if (!run) return c.json({ error: 'run not found' }, 404);
  return c.json(run);
});

app.get('/api/runs/:project/:runId/diff', async (c) => {
  const result = await buildDiff(c.req.param('project'), c.req.param('runId'), {
    base: c.req.query('base'),
    candidate: c.req.query('candidate'),
  });
  if (result.error) return c.json(result, 400);
  return c.json(result);
});

// Read-only image asset for the Visual Validation panel. Streams a visual-diff
// image file strictly confined to the run dir (resolveRunAsset re-validates the
// path); 404 for anything missing, escaping, or not an allowed image type.
app.get('/api/runs/:project/:runId/asset', (c) => {
  const rel = c.req.query('path');
  const asset = resolveRunAsset(
    c.req.param('project'),
    c.req.param('runId'),
    rel,
  );
  if (!asset) return c.json({ error: 'asset not found' }, 404);
  const body = Readable.toWeb(createReadStream(asset.filePath));
  return new Response(body, {
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'no-cache',
    },
  });
});

// ── Launch control (mutating; gated by NSV_ALLOW_LAUNCH / NSV_ALLOW_REAL) ──
// Register specific paths before the bare :id so they aren't shadowed.
app.get('/api/launch/config', (c) => c.json(launchConfig()));

app.get('/api/launch', (c) => c.json({ launches: listLaunches() }));

app.post('/api/launch', csrfGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = launchRun(body);
  if (r.error) return c.json({ error: r.error }, r.code || 400);
  return c.json(r);
});

app.get('/api/launch/:id/stream', (c) => {
  const id = c.req.param('id');
  const snapshot = getLaunch(id);
  const stream = new ReadableStream({
    start(controller) {
      const enc = (obj) => controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      if (!snapshot) {
        enc({ type: 'error', error: 'launch not found' });
        controller.close();
        return;
      }
      for (const line of snapshot.log) enc({ type: 'line', line });
      enc({ type: 'status', status: snapshot.status, exitCode: snapshot.exitCode });
      const unsub = subscribeLaunch(id, (ev) => enc(ev));
      c.req.raw.signal.addEventListener('abort', () => {
        if (unsub) unsub();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

app.post('/api/launch/:id/stop', csrfGuard, (c) =>
  stopRun(c.req.param('id'))
    ? c.json({ ok: true })
    : c.json({ error: 'launch not found or not running' }, 404),
);

app.get('/api/launch/:id', (c) => {
  const l = getLaunch(c.req.param('id'));
  return l ? c.json(l) : c.json({ error: 'launch not found' }, 404);
});

// SSE: push the live state.json of each project whenever it changes (WORKFLOW §1).
// Single local client; EventSource auto-reconnects.
app.get('/api/events', (c) => {
  const watchPaths = PROJECTS.map((p) =>
    path.join(p.root, '.night-shift', 'state.json'),
  );
  const stream = new ReadableStream({
    start(controller) {
      const enc = (obj) =>
        controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      const emit = async (file) => {
        try {
          const project = PROJECTS.find((p) =>
            file.startsWith(p.root),
          )?.id;
          const state = JSON.parse(await readFile(file, 'utf8'));
          enc({ project, status: state.status, stage: state.stage, runId: state.run_id });
        } catch {
          /* file may not exist for projects with only archives */
        }
      };
      enc({ hello: true, projects: PROJECTS.map((p) => p.id) });
      const watcher = chokidar.watch(watchPaths, { persistent: false });
      watcher.on('change', emit).on('add', emit);
      c.req.raw.signal.addEventListener('abort', () => {
        watcher.close();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// Exported so tests can drive routes via `app.request(...)` without binding a
// port. Only start the listener when run directly (node src/server.js), not when
// imported by a test.
export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
    console.log(`[night-shift-viewer] read-only API on http://${HOST}:${info.port}`);
    console.log(
      `[night-shift-viewer] scanning: ${PROJECTS.map((p) => p.id).join(', ') || '(none found)'}`,
    );
  });
}
