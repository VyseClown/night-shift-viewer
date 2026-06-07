import { useEffect, useState } from 'react';
import { getSpec } from '../api.js';
import { StatusBadge } from './ui.jsx';
import Markdown from './Markdown.jsx';

export default function SpecDetail({ specName, onOpenRun }) {
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!specName) return;
    setSpec(null);
    setErr(null);
    getSpec(specName)
      .then(setSpec)
      .catch((e) => {
        const msg = String(e);
        if (msg.includes('404')) {
          setErr('Spec file not found — it may have moved since the run.');
        } else {
          setErr(msg);
        }
      });
  }, [specName]);

  if (!specName) return <p className="muted">Select a spec.</p>;
  if (err) return <div className="banner banner-err">{err}</div>;
  if (!spec) return <p className="muted">Loading spec…</p>;

  const m = spec.meta || {};
  const runs = spec.runs || [];

  return (
    <div className="detail spec-detail">
      <div className="detail-head">
        <h2>{m.title || spec.name}</h2>
      </div>

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

      {runs.length > 0 && (
        <section className="section">
          <h3>Runs for this spec</h3>
          <ul className="run-list">
            {runs.map((r) => (
              <li
                key={`${r.project}/${r.runId}`}
                className="run-item spec-run-item"
                onClick={() => onOpenRun && onOpenRun(r)}
              >
                <div className="run-item-top">
                  <span className="run-task">{r.project} / {r.runId}</span>
                  <StatusBadge status={r.status} />
                </div>
                {r.startedAt && (
                  <div className="muted run-date">{r.startedAt}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h3>Spec content</h3>
        <Markdown>{spec.markdown}</Markdown>
      </section>
    </div>
  );
}
