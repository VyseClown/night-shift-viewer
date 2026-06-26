// Pure validation for `visual-diff` reports (Design Fidelity Phase 2). Node
// built-ins only — no imports, no node_modules — so it is unit-testable with the
// built-in `node --test` and `node --check`. Mirrors `schemas/visual-diff.json`
// key-for-key; keep the two in lock-step. Never throws: malformed input is
// reported via the returned `errors`, never surfaced as a pass.

const SCREEN_KEYS = [
  'screen', 'state', 'device', 'reference', 'screenshot',
  'diff_pct', 'tolerance', 'pass', 'analysis', 'attempts', 'diff_image',
];

// Keys allowed on a screen but not required — present on reports from newer
// engine versions, absent on older ones. Tolerated either way (back-compat).
const OPTIONAL_SCREEN_KEYS = ['unmet_brief'];

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Validate a report against the visual-diff contract. Returns { ok, errors };
// `ok` is true iff `errors` is empty. Pure and total — any shape of input is
// tolerated and described rather than thrown on.
export function validateVisualDiff(report) {
  const errors = [];

  if (!isPlainObject(report)) {
    return { ok: false, errors: ['report must be an object'] };
  }

  for (const key of Object.keys(report)) {
    if (key !== 'task' && key !== 'screens') {
      errors.push(`unexpected top-level key: ${key}`);
    }
  }

  if (!isNonEmptyString(report.task)) {
    errors.push('task must be a non-empty string');
  }

  if (!Array.isArray(report.screens) || report.screens.length === 0) {
    errors.push('screens must be a non-empty array');
    return { ok: errors.length === 0, errors };
  }

  report.screens.forEach((screen, i) => {
    const at = `screens[${i}]`;
    if (!isPlainObject(screen)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(screen)) {
      if (!SCREEN_KEYS.includes(key) && !OPTIONAL_SCREEN_KEYS.includes(key)) {
        errors.push(`${at} has unexpected key: ${key}`);
      }
    }
    for (const key of SCREEN_KEYS) {
      if (!(key in screen)) {
        errors.push(`${at} missing key: ${key}`);
      }
    }
    if ('unmet_brief' in screen &&
        !(Array.isArray(screen.unmet_brief) &&
          screen.unmet_brief.every((s) => typeof s === 'string'))) {
      errors.push(`${at}.unmet_brief must be an array of strings`);
    }

    if (!isNonEmptyString(screen.screen)) errors.push(`${at}.screen must be a non-empty string`);
    if (!isNonEmptyString(screen.state)) errors.push(`${at}.state must be a non-empty string`);
    if (!isNonEmptyString(screen.reference)) errors.push(`${at}.reference must be a non-empty string`);
    if (!isNonEmptyString(screen.screenshot)) errors.push(`${at}.screenshot must be a non-empty string`);

    if (!isNonEmptyString(screen.device)) errors.push(`${at}.device must be a non-empty string`);
    if (typeof screen.analysis !== 'string') errors.push(`${at}.analysis must be a string`);

    if (!Array.isArray(screen.attempts)) {
      errors.push(`${at}.attempts must be an array`);
    } else {
      screen.attempts.forEach((a, j) => {
        const aat = `${at}.attempts[${j}]`;
        if (!isPlainObject(a)) { errors.push(`${aat} must be an object`); return; }
        if (!Number.isInteger(a.attempt) || a.attempt < 1) errors.push(`${aat}.attempt must be an integer >= 1`);
        if (!isFiniteNumber(a.diff_pct) || a.diff_pct < 0) errors.push(`${aat}.diff_pct must be a number >= 0`);
        if (typeof a.pass !== 'boolean') errors.push(`${aat}.pass must be a boolean`);
        if (typeof a.analysis !== 'string') errors.push(`${aat}.analysis must be a string`);
        if (!isNonEmptyString(a.screenshot)) errors.push(`${aat}.screenshot must be a non-empty string`);
        if (a.diff_image !== null && !isNonEmptyString(a.diff_image)) errors.push(`${aat}.diff_image must be a non-empty string or null`);
      });
    }

    if (!isFiniteNumber(screen.diff_pct) || screen.diff_pct < 0) {
      errors.push(`${at}.diff_pct must be a number >= 0`);
    }
    if (!isFiniteNumber(screen.tolerance) || screen.tolerance < 0) {
      errors.push(`${at}.tolerance must be a number >= 0`);
    }
    if (typeof screen.pass !== 'boolean') {
      errors.push(`${at}.pass must be a boolean`);
    }
    if (screen.diff_image !== null && !isNonEmptyString(screen.diff_image)) {
      errors.push(`${at}.diff_image must be a non-empty string or null`);
    }

    // Pass-consistency: pass is true iff the diff is within tolerance. Only
    // checked when the operands are well-formed, so a type error above isn't
    // double-reported as an inconsistency.
    if (
      typeof screen.pass === 'boolean' &&
      isFiniteNumber(screen.diff_pct) &&
      isFiniteNumber(screen.tolerance)
    ) {
      const expected = screen.diff_pct <= screen.tolerance;
      if (screen.pass !== expected) {
        errors.push(
          `${at}.pass (${screen.pass}) is inconsistent with diff_pct ${screen.diff_pct} <= tolerance ${screen.tolerance} (${expected})`,
        );
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

// True iff the report is valid and every screen passed. Invalid or malformed
// input returns false — the UI must never surface a false "pass".
export function overallPass(report) {
  const { ok } = validateVisualDiff(report);
  if (!ok) return false;
  return report.screens.every((s) => s.pass === true);
}
