import { analyze, toggleOn, toggleOff } from '../personaEdits.js';

// Panel shown in edit mode listing optional review personas as checkboxes.
// When the manifest is empty (engine too old or unavailable), renders nothing.
// `onChange(newDraft)` is called after each toggle.
export default function PersonaToggles({ draft, manifest, onChange }) {
  if (!manifest || manifest.optional_personas.length === 0) return null;

  const personas = manifest.optional_personas;
  const rows = analyze(draft, personas);

  const missingOwnership = rows.some((r) => r.effective && !r.hasOwnership);

  function handleChange(row, checked) {
    const next = checked
      ? toggleOn(draft, row.name, personas)
      : toggleOff(draft, row.name);
    onChange(next);
  }

  return (
    <fieldset className="persona-toggles">
      <legend>Optional review personas</legend>
      <ul className="persona-toggles-list">
        {rows.map((row) => {
          const noteId = `persona-note-${row.name.replace(/\s+/g, '-')}`;
          const isViaSection = row.viaSection && !row.inField;
          return (
            <li key={row.name} className="persona-toggle-item">
              <label htmlFor={`persona-${row.name.replace(/\s+/g, '-')}`}>
                <input
                  id={`persona-${row.name.replace(/\s+/g, '-')}`}
                  type="checkbox"
                  checked={row.effective}
                  disabled={isViaSection}
                  aria-describedby={isViaSection ? noteId : undefined}
                  onChange={(e) => handleChange(row, e.target.checked)}
                />
                {row.name}
              </label>
              {isViaSection && (
                <span id={noteId} className="persona-toggle-note muted">
                  active via its {row.contractHeading} section
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {missingOwnership && (
        <div role="alert" aria-live="polite" className="persona-ownership-warning banner banner-warn">
          One or more active personas are missing a documentation-ownership line.
          Add a line under "Documentation owned by each review persona:" for each enabled persona.
        </div>
      )}
    </fieldset>
  );
}
