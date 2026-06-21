import { useEffect, useState } from 'react';
import { postLaunch, getSpecs } from '../api.js';
import LogConsole from './LogConsole.jsx';

// mode → { label, paid, description }
const MODES = {
  'dry-run': {
    label: 'Dry run (fixtures)',
    paid: false,
    desc: 'Runs the deterministic fixture suite. No model calls, no cost — proves the live pipeline in seconds.',
  },
  fixture: {
    label: 'Fixture (live smoke)',
    paid: true,
    desc: 'Minimal live Claude startup/observer checks. Small but real cost.',
  },
  real: {
    label: 'Real run (project)',
    paid: true,
    desc: 'Full autonomous overnight run: implements, reviews, commits. Consumes usage/billing for hours.',
  },
};

export default function LaunchPanel({ config, onLaunched }) {
  const [mode, setMode] = useState('dry-run');
  const [project, setProject] = useState(config.projects?.[0] || '');
  const [spec, setSpec] = useState('');
  const [specs, setSpecs] = useState([]);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (mode === 'real' && specs.length === 0) {
      getSpecs()
        .then((s) => setSpecs(s.filter((x) => !x.isTemplate)))
        .catch(() => {});
    }
  }, [mode]);

  const m = MODES[mode];
  const notReady = (config?.repos || []).filter((r) => !r.ready);
  const realDisabled = mode === 'real' && !config.realEnabled;
  const needsConfirm = m.paid;
  const canStart =
    !busy && !realDisabled && (!needsConfirm || confirmPaid) &&
    (mode !== 'real' || project);

  async function start() {
    setErr(null);
    setBusy(true);
    try {
      const body = { mode };
      if (mode === 'real') {
        body.project = project;
        if (spec) body.spec = spec;
      }
      const r = await postLaunch(body);
      setActiveId(r.id);
      onLaunched?.(r);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="launch">
      <h2>Launch a run</h2>
      <p className="muted">
        Launching is enabled on this server. The read-only default does not allow
        it — this server was started with <code className="mono">NSV_ALLOW_LAUNCH=1</code>.
      </p>

      <div className="launch-modes">
        {Object.entries(MODES).map(([key, info]) => (
          <label
            key={key}
            className={`mode-card ${mode === key ? 'mode-active' : ''} ${
              key === 'real' && !config.realEnabled ? 'mode-locked' : ''
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={key}
              checked={mode === key}
              onChange={() => {
                setMode(key);
                setConfirmPaid(false);
                setErr(null);
              }}
            />
            <span className="mode-label">
              {info.label}{' '}
              {info.paid ? (
                <span className="chip chip-paid">paid</span>
              ) : (
                <span className="chip chip-free">free</span>
              )}
            </span>
            <span className="muted mode-desc">{info.desc}</span>
          </label>
        ))}
      </div>

      {notReady.length > 0 && (
        <div className="banner">
          <strong>
            {notReady.length} repo{notReady.length > 1 ? 's' : ''} under{' '}
            <code className="mono">~/work</code> not ready to launch:
          </strong>
          <ul className="notready-list">
            {notReady.map((r) => (
              <li key={r.id}>
                <code className="mono">{r.id}</code> — {r.blockers.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {realDisabled && (
        <div className="banner">
          Real runs are locked. Restart the server with{' '}
          <code className="mono">NSV_ALLOW_REAL=1</code> to enable them.
        </div>
      )}

      {mode === 'real' && config.realEnabled && (
        <div className="launch-fields">
          <label>
            Project
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              {(config.projects || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Spec (optional — else picks next from TODO.md)
            <select value={spec} onChange={(e) => setSpec(e.target.value)}>
              <option value="">(auto: next TODO)</option>
              {specs
                .filter((s) => !project || (s.projectPath || '').includes(project))
                .map((s) => (
                  <option key={s.name} value={`specs/${s.file}`}>
                    {s.name} [{s.track}/{s.reviewProfile || '?'}]
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}

      {needsConfirm && !realDisabled && (
        <label className="confirm-row">
          <input
            type="checkbox"
            checked={confirmPaid}
            onChange={(e) => setConfirmPaid(e.target.checked)}
          />
          I understand this makes paid Claude calls
          {mode === 'real' ? ' and runs autonomously (edits + commits) for hours.' : '.'}
        </label>
      )}

      {err && <div className="banner banner-err">{err}</div>}

      <button className="start-btn" disabled={!canStart} onClick={start}>
        ▶ Start {m.label}
      </button>

      {activeId && (
        <div className="launch-active">
          <div className="muted launch-id">launch {activeId}</div>
          <LogConsole launchId={activeId} />
        </div>
      )}
    </div>
  );
}
