import { useState } from 'react';

// Rounds are a GLOBAL counter across plan+implementation (WORKFLOW §0.2) — we
// group and label by directory stage, never by the bare round number.
export default function PersonaMatrix({ personas }) {
  const [open, setOpen] = useState(null);
  if (!personas?.length) return <p className="muted">No persona reviews.</p>;

  const stages = ['plan', 'implementation'];
  const allPersonas = [
    ...new Set(personas.flatMap((r) => r.reviews.map((v) => v.persona))),
  ];

  return (
    <div>
      {stages.map((stage) => {
        const rounds = personas.filter((r) => r.stage === stage);
        if (!rounds.length) return null;
        return (
          <div key={stage} className="matrix-block">
            <h4 className="matrix-stage">{stage}</h4>
            <table className="matrix">
              <thead>
                <tr>
                  <th>persona</th>
                  {rounds.map((r) => (
                    <th key={r.round}>{r.round}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPersonas.map((persona) => (
                  <tr key={persona}>
                    <td className="persona-name">{persona}</td>
                    {rounds.map((r) => {
                      const review = r.reviews.find((v) => v.persona === persona);
                      if (!review) return <td key={r.round} className="cell-na">·</td>;
                      const blocked = review.status === 'BLOCK';
                      const key = `${stage}-${r.round}-${persona}`;
                      return (
                        <td
                          key={r.round}
                          className={`cell ${blocked ? 'cell-block' : 'cell-approve'}`}
                          onClick={() =>
                            blocked && setOpen(open === key ? null : key)
                          }
                          title={
                            blocked
                              ? review.findings.map((f) => f.id).join(', ')
                              : 'APPROVE'
                          }
                        >
                          {blocked ? `BLOCK (${review.findings.length})` : 'APPR'}
                          {open === key && (
                            <div className="findings-pop">
                              {review.findings.map((f) => (
                                <div key={f.id} className="finding">
                                  <strong>{f.id}</strong>
                                  <div className="muted">{f.required_change}</div>
                                  <div className="evidence">{f.evidence}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
