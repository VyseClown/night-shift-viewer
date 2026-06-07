import { useEffect, useRef, useState } from 'react';
import { launchStreamUrl, stopLaunch } from '../api.js';
import { StatusBadge } from './ui.jsx';

function lineClass(line) {
  if (line.startsWith('ok - ')) return 'log-ok';
  if (line.startsWith('not ok - ')) return 'log-bad';
  if (line.includes('BLOCKED')) return 'log-bad';
  if (line.startsWith('[night-shift]')) return 'log-sys';
  return 'log-ctx';
}

// Maps a launch status to the StatusBadge palette.
const badgeFor = (s) =>
  s === 'running' ? 'running' : s === 'exited' ? 'complete' : 'blocked';

export default function LogConsole({ launchId, onStatus }) {
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState('running');
  const [exitCode, setExitCode] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!launchId) return;
    setLines([]);
    setStatus('running');
    setExitCode(null);
    const es = new EventSource(launchStreamUrl(launchId));
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'line') {
        setLines((l) => [...l, ev.line]);
      } else if (ev.type === 'status') {
        setStatus(ev.status);
        setExitCode(ev.exitCode);
        onStatus?.(ev.status);
        if (ev.status !== 'running') es.close();
      } else if (ev.type === 'error') {
        setStatus('error');
        es.close();
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects; final status already closes it */
    };
    return () => es.close();
  }, [launchId]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines]);

  if (!launchId) return null;

  return (
    <div className="log-wrap">
      <div className="log-head">
        <StatusBadge status={badgeFor(status)} />
        <span className="muted">
          {status}
          {exitCode != null ? ` (exit ${exitCode})` : ''} · {lines.length} lines
        </span>
        {status === 'running' && (
          <button className="stop-btn" onClick={() => stopLaunch(launchId)}>
            ◼ Stop
          </button>
        )}
      </div>
      <pre className="log-box" ref={boxRef}>
        {lines.map((line, i) => (
          <div key={i} className={`log-line ${lineClass(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
