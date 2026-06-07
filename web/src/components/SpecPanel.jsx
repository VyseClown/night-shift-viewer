import { useEffect, useState } from 'react';
import { getSpec } from '../api.js';
import Markdown from './Markdown.jsx';

export default function SpecPanel({ name }) {
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!name) return;
    setSpec(null);
    setErr(null);
    getSpec(name)
      .then(setSpec)
      .catch((e) => {
        const msg = String(e);
        if (msg.includes('404')) {
          setErr('Spec file not found — it may have moved since the run.');
        } else {
          setErr(msg);
        }
      });
  }, [name]);

  if (!name) return <p className="muted">No spec name associated with this run.</p>;
  if (err) return <p className="muted spec-not-found">{err}</p>;
  if (!spec) return <p className="muted">Loading spec…</p>;

  const m = spec.meta || {};
  return (
    <div className="spec-panel">
      <div className="spec-meta-row">
        {m.track && <span className="chip chip-track">{m.track}</span>}
        {m.reviewProfile && <span className="chip chip-profile">{m.reviewProfile}</span>}
        {m.projectPath && <span className="chip chip-project">{m.projectPath}</span>}
        {m.baseBranch && m.featureBranch && (
          <span className="chip chip-branch">
            {m.baseBranch} → {m.featureBranch}
          </span>
        )}
      </div>
      <Markdown>{spec.markdown}</Markdown>
    </div>
  );
}
