import { useEffect, useState } from 'react';
import { getRuns } from './api.js';
import RunList from './components/RunList.jsx';
import RunDetail from './components/RunDetail.jsx';

export default function App() {
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getRuns()
      .then((r) => {
        setRuns(r);
        if (r.length) setSelected(r[0]);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>night-shift</h1>
        <p className="muted tagline">read-only run viewer</p>
        {err && <div className="banner banner-err">{err}</div>}
        <RunList
          runs={runs}
          selected={selected ? `${selected.project}/${selected.runId}` : null}
          onSelect={setSelected}
        />
      </aside>
      <main className="main">
        {selected ? (
          <RunDetail project={selected.project} runId={selected.runId} />
        ) : (
          <p className="muted">Select a run.</p>
        )}
      </main>
    </div>
  );
}
