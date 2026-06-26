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
