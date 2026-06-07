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
