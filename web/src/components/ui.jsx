const STATUS_COLORS = {
  running: '#2563eb',
  waiting: '#d97706',
  blocked: '#dc2626',
  complete: '#16a34a',
  unknown: '#6b7280',
};

export function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return (
    <span className="badge" style={{ background: color }}>
      {status}
    </span>
  );
}

export function Gate({ label, value }) {
  const state = value === true ? 'pass' : value === false ? 'fail' : 'unknown';
  const mark = value === true ? '✓' : value === false ? '✕' : '?';
  return (
    <span className={`gate gate-${state}`} title={label}>
      <span className="gate-mark">{mark}</span> {label}
    </span>
  );
}

export function Meter({ label, value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const warn = pct >= 80;
  return (
    <div className="meter">
      <div className="meter-label">
        {label} <span className="muted">{value ?? '–'}/{max}</span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{ width: `${pct}%`, background: warn ? '#dc2626' : '#2563eb' }}
        />
      </div>
    </div>
  );
}

export function Mono({ children }) {
  return <code className="mono">{children}</code>;
}
