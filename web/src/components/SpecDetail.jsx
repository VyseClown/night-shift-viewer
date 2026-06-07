import { useEffect, useState } from 'react';
import { getSpec, putSpec } from '../api.js';
import { StatusBadge } from './ui.jsx';
import Markdown from './Markdown.jsx';

// Client-side mirror of the server's specNameSafe — only gates the Save button;
// the server re-validates authoritatively.
function nameLooksSafe(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 128 &&
    !name.includes('..') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    /^[A-Za-z0-9._-]+\.md$/.test(name) &&
    name !== '.md'
  );
}

export default function SpecDetail({
  specName,
  onOpenRun,
  editEnabled = false,
  onSaved,
  existingNames = [],
}) {
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState(null);

  // Editor state. mode: 'view' | 'edit' | 'new'.
  const [mode, setMode] = useState('view');
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [saveOk, setSaveOk] = useState(null);

  function resetEditor() {
    setMode('view');
    setDraft('');
    setNewName('');
    setSaving(false);
    setSaveErr(null);
    setSaveOk(null);
  }

  function loadSpec() {
    if (!specName) return;
    setSpec(null);
    setErr(null);
    getSpec(specName)
      .then(setSpec)
      .catch((e) => {
        const msg = String(e);
        if (msg.includes('404')) {
          setErr('Spec file not found — it may have moved since the run.');
        } else {
          setErr(msg);
        }
      });
  }

  useEffect(() => {
    resetEditor();
    loadSpec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specName]);

  async function save(name, body, { confirmOverwrite } = {}) {
    if (confirmOverwrite && existingNames.includes(name)) {
      const ok = window.confirm(
        `A spec named "${name}" already exists. Overwrite it?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    setSaveErr(null);
    setSaveOk(null);
    try {
      await putSpec(name, body);
      setSaveOk(`Saved ${name}.`);
      if (mode === 'new') {
        onSaved?.(name);
        resetEditor();
      } else {
        setMode('view');
        loadSpec(); // re-fetch so the rendered spec reflects the save
      }
    } catch (e) {
      setSaveErr(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  // ── New-spec form (also reachable when no spec is selected) ──
  function NewSpecForm() {
    const canSave = !saving && nameLooksSafe(newName) && draft.length > 0;
    return (
      <div className="detail spec-detail spec-editor">
        <div className="detail-head">
          <h2>New spec</h2>
        </div>
        <div className="spec-edit-fields">
          <label htmlFor="new-spec-name">
            File name
            <input
              id="new-spec-name"
              type="text"
              placeholder="my-feature.md"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          {newName.length > 0 && !nameLooksSafe(newName) && (
            <p className="muted spec-name-hint">
              Use a plain <code>.md</code> file name (letters, digits,
              <code>. - _</code>) — no slashes or <code>..</code>.
            </p>
          )}
          <label htmlFor="new-spec-body">
            Markdown
            <textarea
              id="new-spec-body"
              className="spec-textarea"
              rows={20}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
        </div>
        {saveErr && (
          <div className="banner banner-err" role="alert">
            {saveErr}
          </div>
        )}
        {saveOk && (
          <div className="banner banner-ok" role="status" aria-live="polite">
            {saveOk}
          </div>
        )}
        <div className="spec-edit-actions">
          <button
            className="start-btn"
            disabled={!canSave}
            onClick={() => save(newName, draft, { confirmOverwrite: true })}
          >
            {saving ? 'Saving…' : 'Save new spec'}
          </button>
          <button className="ghost-btn" disabled={saving} onClick={resetEditor}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'new') return <NewSpecForm />;

  if (!specName) {
    if (!editEnabled) return <p className="muted">Select a spec.</p>;
    return (
      <div className="detail spec-detail">
        <p className="muted">Select a spec, or create a new one.</p>
        <button
          className="start-btn"
          onClick={() => {
            resetEditor();
            setMode('new');
          }}
        >
          ＋ New spec
        </button>
      </div>
    );
  }

  if (err) return <div className="banner banner-err">{err}</div>;
  if (!spec) return <p className="muted">Loading spec…</p>;

  const m = spec.meta || {};
  const runs = spec.runs || [];

  // ── Edit mode (existing spec) ──
  if (mode === 'edit') {
    const canSave = !saving && draft.length > 0;
    return (
      <div className="detail spec-detail spec-editor">
        <div className="detail-head">
          <h2>Editing {spec.file}</h2>
        </div>
        <div className="spec-edit-fields">
          <label htmlFor="edit-spec-body">
            Markdown
            <textarea
              id="edit-spec-body"
              className="spec-textarea"
              rows={24}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
        </div>
        {saveErr && (
          <div className="banner banner-err" role="alert">
            {saveErr}
          </div>
        )}
        {saveOk && (
          <div className="banner banner-ok" role="status" aria-live="polite">
            {saveOk}
          </div>
        )}
        <div className="spec-edit-actions">
          <button
            className="start-btn"
            disabled={!canSave}
            onClick={() => save(spec.file, draft)}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="ghost-btn" disabled={saving} onClick={resetEditor}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── View mode ──
  return (
    <div className="detail spec-detail">
      <div className="detail-head">
        <h2>{m.title || spec.name}</h2>
        {editEnabled && (
          <div className="spec-edit-toolbar">
            <button
              className="ghost-btn"
              onClick={() => {
                setSaveOk(null);
                setSaveErr(null);
                setDraft(spec.markdown);
                setMode('edit');
              }}
            >
              Edit
            </button>
            <button
              className="ghost-btn"
              onClick={() => {
                resetEditor();
                setMode('new');
              }}
            >
              ＋ New spec
            </button>
          </div>
        )}
      </div>

      {saveOk && (
        <div className="banner banner-ok" role="status" aria-live="polite">
          {saveOk}
        </div>
      )}

      <div className="spec-meta-row">
        {m.track && <span className="chip chip-track">{m.track}</span>}
        {m.reviewProfile && <span className="chip chip-profile">{m.reviewProfile}</span>}
        {m.projectPath && <span className="chip chip-project">{m.projectPath}</span>}
        {m.baseBranch && m.featureBranch && (
          <span className="chip chip-branch">
            {m.baseBranch} → {m.featureBranch}
          </span>
        )}
      </div>

      {runs.length > 0 && (
        <section className="section">
          <h3>Runs for this spec</h3>
          <ul className="run-list">
            {runs.map((r) => (
              <li
                key={`${r.project}/${r.runId}`}
                className="run-item spec-run-item"
                onClick={() => onOpenRun && onOpenRun(r)}
              >
                <div className="run-item-top">
                  <span className="run-task">{r.project} / {r.runId}</span>
                  <StatusBadge status={r.status} />
                </div>
                {r.startedAt && (
                  <div className="muted run-date">{r.startedAt}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h3>Spec content</h3>
        <Markdown>{spec.markdown}</Markdown>
      </section>
    </div>
  );
}
