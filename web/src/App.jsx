import { useEffect, useRef, useState } from 'react';
import { getRuns, getSpecs, getLaunchConfig } from './api.js';
import RunList from './components/RunList.jsx';
import RunDetail from './components/RunDetail.jsx';
import SpecsList from './components/SpecsList.jsx';
import SpecDetail from './components/SpecDetail.jsx';
import LaunchPanel from './components/LaunchPanel.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('runs');

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runsErr, setRunsErr] = useState(null);

  const [specs, setSpecs] = useState([]);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [specsErr, setSpecsErr] = useState(null);

  const [launchCfg, setLaunchCfg] = useState(null);

  const refetchRuns = () => getRuns().then(setRuns).catch((e) => setRunsErr(String(e)));

  useEffect(() => {
    getRuns()
      .then((r) => {
        setRuns(r);
        if (r.length) setSelectedRun((cur) => cur || r[0]);
      })
      .catch((e) => setRunsErr(String(e)));
    getLaunchConfig().then(setLaunchCfg).catch(() => setLaunchCfg({ enabled: false }));
  }, []);

  // Live: refresh the runs list whenever any project's state.json changes on disk.
  const debounce = useRef(null);
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = () => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(refetchRuns, 800);
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  useEffect(() => {
    if (activeTab === 'specs' && specs.length === 0 && !specsErr) {
      getSpecs().then(setSpecs).catch((e) => setSpecsErr(String(e)));
    }
  }, [activeTab]);

  function handleOpenRun(run) {
    const match = runs.find(
      (r) => r.project === run.project && r.runId === run.runId,
    );
    setSelectedRun(match || run);
    setActiveTab('runs');
  }

  const tabs = [
    ['runs', 'Runs'],
    ['specs', 'Specs'],
    ...(launchCfg?.enabled ? [['launch', 'Launch']] : []),
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>night-shift</h1>
        <p className="muted tagline">
          {launchCfg?.enabled ? 'run viewer + launcher' : 'read-only run viewer'}
        </p>

        <div className="tab-bar">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={`tab-btn${activeTab === key ? ' tab-btn-active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
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

        {activeTab === 'launch' && (
          <p className="muted">
            Launch a night-shift run and watch it stream. Real runs are{' '}
            {launchCfg?.realEnabled ? 'enabled' : 'locked'}.
          </p>
        )}
      </aside>

      <main className="main">
        {activeTab === 'runs' &&
          (selectedRun ? (
            <RunDetail project={selectedRun.project} runId={selectedRun.runId} />
          ) : (
            <p className="muted">Select a run.</p>
          ))}
        {activeTab === 'specs' &&
          (selectedSpec ? (
            <SpecDetail specName={selectedSpec.name} onOpenRun={handleOpenRun} />
          ) : (
            <p className="muted">Select a spec.</p>
          ))}
        {activeTab === 'launch' && launchCfg && (
          <LaunchPanel config={launchCfg} onLaunched={() => setTimeout(refetchRuns, 1500)} />
        )}
      </main>
    </div>
  );
}
