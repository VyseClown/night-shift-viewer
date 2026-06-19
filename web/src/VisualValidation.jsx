// Read-only Visual Validation panel: renders `visual-diff` evidence (per
// screen/state design reference vs implementation screenshot vs diff image, the
// diff % against tolerance, and a pass/fail badge) for a run. Pure render of the
// server-provided `run.visual` array. Degrades gracefully: images only render
// when the server resolved them on disk, and an invalid/unparseable report is
// shown as a flagged error — never as a pass.

function VvBadge({ pass }) {
  const label = pass ? 'pass' : 'fail';
  return <span className={`vv-badge vv-badge-${label}`}>{label}</span>;
}

function VvImage({ url, alt, label }) {
  return (
    <figure className="vv-figure">
      <figcaption className="vv-figcap">{label}</figcaption>
      {url ? (
        <img className="vv-img" src={url} alt={alt} loading="lazy" />
      ) : (
        <div className="vv-noimg" aria-label={`${alt} — no image`}>
          no image
        </div>
      )}
    </figure>
  );
}

function VvAttempts({ attempts }) {
  if (!attempts?.length) return null;
  return (
    <details className="vv-attempts">
      <summary>Attempts ({attempts.length})</summary>
      <ol className="vv-attempt-list">
        {attempts.map((a) => (
          <li key={a.attempt} className="vv-attempt">
            <span className={a.pass ? 'exit-ok' : 'exit-bad'}>
              {a.attempt}. {a.diff_pct}% {a.pass ? 'pass' : 'fail'}
            </span>
            {a.analysis && <span className="vv-attempt-analysis"> — {a.analysis}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function VvScreen({ screen }) {
  const id = `${screen.screen ?? '—'} · ${screen.state ?? '—'} · ${screen.device ?? '—'}`;
  return (
    <section className="vv-screen">
      <div className="vv-screen-head">
        <h5 className="vv-screen-title">{id}</h5>
        <VvBadge pass={screen.pass === true} />
      </div>
      <div className="vv-images">
        <VvImage url={screen.referenceUrl} label="reference" alt={`${id} reference`} />
        <VvImage url={screen.screenshotUrl} label="implementation" alt={`${id} implementation`} />
        <VvImage url={screen.diffImageUrl} label="diff" alt={`${id} diff`} />
      </div>
      <p className="vv-metrics muted">
        diff <strong className={screen.pass === true ? 'exit-ok' : 'exit-bad'}>{screen.diff_pct}%</strong>{' '}
        vs tolerance {screen.tolerance}%
      </p>
      {screen.analysis && <p className="vv-analysis">Analysis: {screen.analysis}</p>}
      <VvAttempts attempts={screen.attempts} />
    </section>
  );
}

function VvReport({ report }) {
  return (
    <article className="vv-report">
      <div className="vv-report-head">
        <h4 className="vv-report-file">{report.file}</h4>
        {report.valid && (
          <VvBadge pass={report.overallPass} />
        )}
      </div>

      {!report.valid ? (
        <div className="vv-invalid" role="alert">
          <strong>Unparseable / invalid report</strong>
          <ul className="vv-errors">
            {report.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {report.task && <p className="muted vv-task">{report.task}</p>}
          {report.screens.map((s, i) => (
            <VvScreen key={`${s.screen}-${s.state}-${i}`} screen={s} />
          ))}
        </>
      )}
    </article>
  );
}

export default function VisualValidation({ visual }) {
  if (!visual?.length) {
    return <p className="muted">No visual-diff evidence for this run.</p>;
  }
  return (
    <div className="vv">
      {visual.map((report) => (
        <VvReport key={report.file} report={report} />
      ))}
    </div>
  );
}
