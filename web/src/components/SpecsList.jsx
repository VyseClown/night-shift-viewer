import { useState } from 'react';
import { StatusBadge } from './ui.jsx';

const RUN_STATUS_COLORS = {
  complete: '#16a34a',
  blocked: '#dc2626',
  running: '#2563eb',
};

function RunStatusChip({ status }) {
  if (status === 'none' || !status) {
    return <span className="chip chip-no-run">no run</span>;
  }
  const color = RUN_STATUS_COLORS[status] || '#6b7280';
  return (
    <span className="badge" style={{ background: color }}>
      {status}
    </span>
  );
}

export default function SpecsList({ specs, selected, onSelect }) {
  const [showTemplates, setShowTemplates] = useState(false);

  if (!specs?.length) return <p className="muted">No specs found.</p>;

  const visible = showTemplates ? specs : specs.filter((s) => !s.isTemplate);
  const templateCount = specs.filter((s) => s.isTemplate).length;

  return (
    <div className="specs-list-wrap">
      {templateCount > 0 && (
        <button
          className="toggle-templates-btn"
          onClick={() => setShowTemplates((v) => !v)}
        >
          {showTemplates ? `hide ${templateCount} templates` : `show ${templateCount} templates`}
        </button>
      )}
      <ul className="run-list">
        {visible.map((spec) => {
          const isSelected = selected === spec.name;
          return (
            <li
              key={spec.name}
              className={`run-item spec-item${isSelected ? ' selected' : ''}${spec.isTemplate ? ' spec-item-template' : ''}`}
              onClick={() => onSelect(spec)}
            >
              <div className="run-item-top">
                <span className="run-task">{spec.title || spec.name}</span>
                <RunStatusChip status={spec.runStatus} />
              </div>
              <div className="spec-item-chips">
                {spec.track && <span className="chip chip-track">{spec.track}</span>}
                {spec.reviewProfile && (
                  <span className="chip chip-profile">{spec.reviewProfile}</span>
                )}
                {spec.todo && (
                  <span className={`chip chip-todo chip-todo-${spec.todo.type}`}>
                    {spec.todo.type}{spec.todo.checked ? ' ✓' : ''}
                  </span>
                )}
                {spec.isTemplate && <span className="chip chip-template">template</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
