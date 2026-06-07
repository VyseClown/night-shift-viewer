async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export const getRuns = () => get('/api/runs').then((d) => d.runs);
export const getRun = (project, runId) =>
  get(`/api/runs/${project}/${runId}`);
export const getDiff = (project, runId, { base, candidate } = {}) => {
  const q = new URLSearchParams();
  if (base) q.set('base', base);
  if (candidate) q.set('candidate', candidate);
  return get(`/api/runs/${project}/${runId}/diff?${q.toString()}`);
};

export const getSpecs = () => get('/api/specs').then((d) => d.specs);
export const getSpec = (name) => get(`/api/specs/${encodeURIComponent(name)}`);

// Create or overwrite a spec (gated by NSV_ALLOW_EDIT on the server). Body is the
// raw markdown text. Throws Error(message) on a non-2xx response.
export async function putSpec(name, markdown) {
  const res = await fetch(`/api/specs/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'text/markdown' },
    body: markdown,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Launch control ──
export const getLaunchConfig = () => get('/api/launch/config');
export const listLaunches = () => get('/api/launch').then((d) => d.launches);

export async function postLaunch(body) {
  const res = await fetch('/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const stopLaunch = (id) =>
  fetch(`/api/launch/${id}/stop`, { method: 'POST' }).then((r) => r.json());

export const launchStreamUrl = (id) => `/api/launch/${id}/stream`;
