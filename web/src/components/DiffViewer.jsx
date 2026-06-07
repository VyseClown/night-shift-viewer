import { useEffect, useState } from 'react';
import { getDiff } from '../api.js';
import { Mono } from './ui.jsx';

// Self-contained unified-diff renderer (zero version risk for the scaffold).
// Planned upgrade: @git-diff-view/react (see WORKFLOW §0 / research notes).
function UnifiedDiff({ raw }) {
  const lines = (raw || '').split('\n');
  return (
    <pre className="diff">
      {lines.map((line, i) => {
        let cls = 'd-ctx';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'd-add';
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'd-del';
        else if (line.startsWith('@@')) cls = 'd-hunk';
        else if (
          line.startsWith('diff ') ||
          line.startsWith('index ') ||
          line.startsWith('+++') ||
          line.startsWith('---')
        )
          cls = 'd-file';
        return (
          <div key={i} className={`d-line ${cls}`}>
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}

export default function DiffViewer({ run }) {
  const { project, runId, diffHint } = run;
  const [diff, setDiff] = useState(null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState('head'); // 'head' | 'approved'

  useEffect(() => {
    setDiff(null);
    setErr(null);
    const candidate = mode === 'approved' ? diffHint.approvedCommit : undefined;
    getDiff(project, runId, { base: diffHint.baseCommit, candidate })
      .then(setDiff)
      .catch((e) => setErr(String(e)));
  }, [project, runId, mode, diffHint.baseCommit, diffHint.approvedCommit]);

  return (
    <div>
      <div className="diff-controls">
        <button
          className={mode === 'head' ? 'active' : ''}
          onClick={() => setMode('head')}
        >
          base → HEAD
        </button>
        {diffHint.approvedCommit && (
          <button
            className={mode === 'approved' ? 'active' : ''}
            onClick={() => setMode('approved')}
          >
            base → observer-approved
          </button>
        )}
        {diff?.source && (
          <span className="muted diff-source">source: {diff.source}</span>
        )}
      </div>
      {diff?.note && <div className="banner">⚠ {diff.note}</div>}
      {err && <div className="banner banner-err">{err}</div>}
      {diff?.files && (
        <div className="diff-files">
          <div className="muted">
            {diff.files.length} file(s):{' '}
            {diff.files.map((f) => (
              <Mono key={f.to}>
                {f.to} (+{f.additions}/-{f.deletions}){' '}
              </Mono>
            ))}
          </div>
          <UnifiedDiff raw={diff.raw} />
        </div>
      )}
      {!diff && !err && <p className="muted">Loading diff…</p>}
    </div>
  );
}
