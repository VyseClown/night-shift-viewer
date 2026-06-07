import { StatusBadge } from './ui.jsx';

export default function RunList({ runs, selected, onSelect }) {
  if (!runs?.length) return <p className="muted">No runs found.</p>;
  return (
    <ul className="run-list">
      {runs.map((r) => {
        const key = `${r.project}/${r.runId}`;
        return (
          <li
            key={key}
            className={`run-item ${selected === key ? 'selected' : ''}`}
            onClick={() => onSelect(r)}
          >
            <div className="run-item-top">
              <span className="run-task">{r.taskName || r.runId}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="muted run-meta">
              {r.project} · {r.primaryTurns ?? '–'} turns · {r.reviewRound ?? '–'}{' '}
              rounds · {r.findingIds?.length ?? 0} findings
            </div>
            <div className="muted run-date">{r.startedAt}</div>
          </li>
        );
      })}
    </ul>
  );
}
