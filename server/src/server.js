import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { HOST, PORT, PROJECTS } from '../config.js';
import { listRuns, loadRun } from './runs.js';
import { buildDiff } from './diff.js';

const app = new Hono();

// Local dev tool: allow the Vite origin. Server binds to 127.0.0.1 only.
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.get('/api/health', (c) =>
  c.json({ ok: true, projects: PROJECTS.map((p) => p.id) }),
);

app.get('/api/runs', async (c) => c.json({ runs: await listRuns() }));

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

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[night-shift-viewer] read-only API on http://${HOST}:${info.port}`);
  console.log(
    `[night-shift-viewer] scanning: ${PROJECTS.map((p) => p.id).join(', ') || '(none found)'}`,
  );
});
