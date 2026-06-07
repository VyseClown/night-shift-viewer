import { useEffect, useState } from 'react';
import { getRun } from '../api.js';
import { StatusBadge, Gate, Meter, Mono } from './ui.jsx';
import PersonaMatrix from './PersonaMatrix.jsx';
import ObserverPanel from './ObserverPanel.jsx';
import EvidencePanel from './EvidencePanel.jsx';
import DiffViewer from './DiffViewer.jsx';
import SpecPanel from './SpecPanel.jsx';

// Caps from night-shift.sh defaults (WORKFLOW §7).
const MAX_TASK_TURNS = 36;

function Section({ title, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <h3
        className={collapsible ? 'section-title-collapsible' : ''}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        {collapsible && <span className="section-toggle">{open ? '▾' : '▸'}</span>}
        {title}
      </h3>
      {(!collapsible || open) && children}
    </section>
  );
}

export default function RunDetail({ project, runId }) {
  const [run, setRun] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setRun(null);
    getRun(project, runId).then(setRun).catch((e) => setErr(String(e)));
  }, [project, runId]);

  if (err) return <div className="banner banner-err">{err}</div>;
  if (!run) return <p className="muted">Loading run…</p>;

  const s = run.summary;
  const st = run.state || {};
  return (
    <div className="detail">
      <div className="detail-head">
        <h2>
          {s.taskName} <span className="muted">· {run.project}</span>
        </h2>
        <StatusBadge status={s.status} />
        {st.stage && <span className="stage-pill">{st.stage}</span>}
      </div>
      <div className="muted runid">
        {run.runId} {run.isArchived ? '(archived)' : '(live)'}
      </div>
      {s.blockReason && <div className="banner banner-err">{s.blockReason}</div>}

      <div className="gates">
        <Gate label="baseline" value={run.gates.baseline_complete} />
        <Gate label="plan" value={run.gates.plan_approved} />
        <Gate label="implementation" value={run.gates.implementation_approved} />
        <Gate label="candidate" value={run.gates.candidate_verified} />
      </div>

      <div className="meters">
        <Meter label="task turns" value={s.primaryTurns} max={MAX_TASK_TURNS} />
        <div className="stat">
          review rounds <strong>{s.reviewRound ?? '–'}</strong>
        </div>
        <div className="stat">
          findings <strong>{s.findingIds?.length ?? 0}</strong>
        </div>
        <div className="stat">
          candidates <strong>{s.candidateCommits?.length ?? 0}</strong>
        </div>
      </div>

      {s.taskName && (
        <Section title="Spec" collapsible defaultOpen={false}>
          <SpecPanel name={s.taskName} />
        </Section>
      )}

      <Section title="Review pipeline">
        <PersonaMatrix personas={run.personas} />
      </Section>

      <Section title="Observer verdict">
        <ObserverPanel observers={run.observers} diffHint={run.diffHint} />
      </Section>

      <Section title="Validation evidence">
        <EvidencePanel evidence={run.evidence} />
      </Section>

      <Section title="Diff">
        <div className="muted">
          base <Mono>{(s.baseCommit || '').slice(0, 9)}</Mono>
          {run.patches?.length > 0 && (
            <span> · stored patch: {run.patches.join(', ')}</span>
          )}
        </div>
        <DiffViewer run={run} />
      </Section>
    </div>
  );
}
