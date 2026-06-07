import { Mono } from './ui.jsx';

function CmdRow({ row }) {
  const ok = row.exit_status === 0;
  return (
    <tr>
      <td>
        <Mono>{row.command}</Mono>
      </td>
      <td>
        <span className={ok ? 'exit-ok' : 'exit-bad'}>exit {row.exit_status}</span>
      </td>
    </tr>
  );
}

function CmdTable({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <div className="evidence-block">
      <h5>{title}</h5>
      <table className="cmd-table">
        <tbody>
          {rows.map((r, i) => (
            <CmdRow key={i} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EvidencePanel({ evidence }) {
  if (!evidence) return null;
  const { baseline, final, testFirstFailing, testFirstPassing } = evidence;
  return (
    <div className="evidence">
      <CmdTable title="Baseline validation" rows={baseline} />
      <CmdTable title="Final validation (isolated worktree)" rows={final} />
      {testFirstFailing && testFirstPassing && (
        <div className="evidence-block">
          <h5>Test-first proof</h5>
          <div className="testfirst">
            <Mono>{testFirstFailing.command}</Mono>
            <div className="testfirst-states">
              <span className="exit-bad">
                before: exit {testFirstFailing.exit_status}
              </span>
              <span className="arrow">→</span>
              <span className="exit-ok">
                after: exit {testFirstPassing.exit_status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
