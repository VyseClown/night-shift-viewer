// Pure string-manipulation helpers for the Optional Reviewers field in spec
// markdown. No React, no DOM, no Node I/O — safe to import in a browser bundle
// or run directly under node --test.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse the `- Optional reviewers:` line → string[] of names.
// Splits on comma or pipe, trims, drops empty and "none".
export function parseField(draft) {
  const m = draft.match(/^- Optional reviewers:\s*(.*)/m);
  if (!m) return [];
  return m[1]
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'none');
}

// True when the draft contains a `## <heading>` section heading (engine rule:
// ^## <heading>(\s|$) — must use multiline flag so ^ matches any line start).
export function hasContractSection(draft, contractHeading) {
  return new RegExp('^## ' + escapeRegex(contractHeading) + '(\\s|$)', 'm').test(draft);
}

// True when the draft contains a documentation-ownership line for `persona`
// (engine rule: ^\s+- <Persona>: .+ — multiline).
export function hasOwnershipLine(draft, persona) {
  return new RegExp('^\\s+- ' + escapeRegex(persona) + ': .+', 'm').test(draft);
}

// Analyse the draft against the manifest and return one entry per persona.
// effective = inField || viaSection.
export function analyze(draft, manifest) {
  const inFieldList = parseField(draft);
  return manifest.map(({ name, contractHeading }) => {
    const inField = inFieldList.includes(name);
    const viaSection = hasContractSection(draft, contractHeading);
    const effective = inField || viaSection;
    const hasOwnership = hasOwnershipLine(draft, name);
    return { name, contractHeading, inField, viaSection, effective, hasOwnership };
  });
}

// Add `persona` to the `- Optional reviewers:` line (creating it / replacing
// `none` / appending). Also inserts a placeholder ownership line when one does
// not yet exist (under the "Documentation owned by" marker). Never mutates.
export function toggleOn(draft, persona, manifest) {
  let result = draft;

  // 1. Update or create the field line.
  const fieldRe = /^- Optional reviewers:\s*(.*)/m;
  const fm = result.match(fieldRe);
  if (fm) {
    const existing = fm[1]
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== 'none');
    if (!existing.includes(persona)) {
      existing.push(persona);
    }
    result = result.replace(fieldRe, `- Optional reviewers: ${existing.join(', ')}`);
  } else {
    // Create the field line. Insert before the ## Documentation section when
    // present, else append at the end.
    const newLine = `- Optional reviewers: ${persona}`;
    const docRe = /^## Documentation/m;
    if (docRe.test(result)) {
      result = result.replace(docRe, `${newLine}\n\n## Documentation`);
    } else {
      result = result.trimEnd() + '\n' + newLine + '\n';
    }
  }

  // 2. Insert ownership placeholder when missing.
  if (!hasOwnershipLine(result, persona)) {
    const markerRe = /^([ \t]*)- Documentation owned by each review persona:\s*$/m;
    const mm = result.match(markerRe);
    if (mm) {
      const indent = mm[1];
      const placeholder = `${indent}  - ${persona}: <describe what this reviewer owns>`;
      result = result.replace(markerRe, `${mm[0]}\n${placeholder}`);
    }
    // If the marker is absent, emit no scaffold — the UI warning fires instead.
  }

  return result;
}

// Remove `persona` from the `- Optional reviewers:` line (→ `none` when empty).
// Ownership lines are intentionally left untouched. Never mutates.
export function toggleOff(draft, persona) {
  const fieldRe = /^- Optional reviewers:\s*(.*)/m;
  const fm = draft.match(fieldRe);
  if (!fm) return draft;
  const remaining = fm[1]
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'none' && s !== persona);
  const value = remaining.length > 0 ? remaining.join(', ') : 'none';
  return draft.replace(fieldRe, `- Optional reviewers: ${value}`);
}
