import { StatusBadge, Mono } from './ui.jsx';

export default function ObserverPanel({ observers, diffHint }) {
  if (!observers?.length) return <p className="muted">No observer verdict.</p>;
  return (
    <div>
      {diffHint?.approvedDiffersFromHead && (
        <div className="banner">
          ⚠ Observer approved <Mono>{short(diffHint.approvedCommit)}</Mono> but
          branch HEAD is <Mono>{short(diffHint.headCommit)}</Mono> — the approved
          state is not what's on the branch.
        </div>
      )}
      {observers.map((o) => (
        <div key={o.candidate_commit} className="observer">
          <div className="observer-head">
            <StatusBadge status={o.status === 'APPROVE' ? 'complete' : 'blocked'} />
            <Mono>{short(o.candidate_commit)}</Mono>
            <span className="muted">{o.findings.length} finding(s)</span>
          </div>
          {o.findings.map((f) => (
            <div key={f.id} className="finding">
              <strong>{f.id}</strong>
              <div>{f.required_change}</div>
              <div className="evidence">{f.evidence}</div>
            </div>
          ))}
          {o.documentation_changes?.length > 0 && (
            <div className="muted">
              docs: {o.documentation_changes.join('; ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const short = (c) => (c ? c.slice(0, 9) : '–');
