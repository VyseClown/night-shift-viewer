import { useEffect, useState } from 'react';
import { getRuns, getSpecs } from './api.js';
import RunList from './components/RunList.jsx';
import RunDetail from './components/RunDetail.jsx';
import SpecsList from './components/SpecsList.jsx';
import SpecDetail from './components/SpecDetail.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('runs');

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runsErr, setRunsErr] = useState(null);

  const [specs, setSpecs] = useState([]);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [specsErr, setSpecsErr] = useState(null);

  useEffect(() => {
    getRuns()
      .then((r) => {
        setRuns(r);
        if (r.length) setSelectedRun(r[0]);
      })
      .catch((e) => setRunsErr(String(e)));
  }, []);

  useEffect(() => {
    if (activeTab === 'specs' && specs.length === 0 && !specsErr) {
      getSpecs()
        .then(setSpecs)
        .catch((e) => setSpecsErr(String(e)));
    }
  }, [activeTab]);

  function handleOpenRun(run) {
    // run here is { project, runId, status, startedAt } from spec runs list
    // find matching full run object if available, otherwise use a stub
    const match = runs.find(
      (r) => r.project === run.project && r.runId === run.runId
    );
    setSelectedRun(match || run);
    setActiveTab('runs');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>night-shift</h1>
        <p className="muted tagline">read-only run viewer</p>

        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === 'runs' ? ' tab-btn-active' : ''}`}
            onClick={() => setActiveTab('runs')}
          >
            Runs
          </button>
          <button
            className={`tab-btn${activeTab === 'specs' ? ' tab-btn-active' : ''}`}
            onClick={() => setActiveTab('specs')}
          >
            Specs
          </button>
        </div>

        {activeTab === 'runs' && (
          <>
            {runsErr && <div className="banner banner-err">{runsErr}</div>}
            <RunList
              runs={runs}
              selected={selectedRun ? `${selectedRun.project}/${selectedRun.runId}` : null}
              onSelect={setSelectedRun}
            />
          </>
        )}

        {activeTab === 'specs' && (
          <>
            {specsErr && <div className="banner banner-err">{specsErr}</div>}
            <SpecsList
              specs={specs}
              selected={selectedSpec?.name || null}
              onSelect={setSelectedSpec}
            />
          </>
        )}
      </aside>

      <main className="main">
        {activeTab === 'runs' && (
          selectedRun ? (
            <RunDetail project={selectedRun.project} runId={selectedRun.runId} />
          ) : (
            <p className="muted">Select a run.</p>
          )
        )}
        {activeTab === 'specs' && (
          selectedSpec ? (
            <SpecDetail specName={selectedSpec.name} onOpenRun={handleOpenRun} />
          ) : (
            <p className="muted">Select a spec.</p>
          )
        )}
      </main>
    </div>
  );
}
