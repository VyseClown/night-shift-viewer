import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseField,
  hasContractSection,
  hasOwnershipLine,
  analyze,
  toggleOn,
  toggleOff,
} from '../src/personaEdits.js';

// ── parseField ────────────────────────────────────────────────────────────────

test('parseField returns [] when field is absent', () => {
  assert.deepEqual(parseField('# Spec\n- Track: web\n'), []);
});

test('parseField returns [] for "none"', () => {
  assert.deepEqual(parseField('- Optional reviewers: none\n'), []);
});

test('parseField parses comma-separated list', () => {
  assert.deepEqual(
    parseField('- Optional reviewers: Security Reviewer, API Contract Reviewer\n'),
    ['Security Reviewer', 'API Contract Reviewer'],
  );
});

test('parseField parses pipe-separated list', () => {
  assert.deepEqual(
    parseField('- Optional reviewers: Security Reviewer | Design Fidelity Reviewer\n'),
    ['Security Reviewer', 'Design Fidelity Reviewer'],
  );
});

// ── hasContractSection ────────────────────────────────────────────────────────

test('hasContractSection returns false when section is absent', () => {
  assert.equal(hasContractSection('# Spec\nSome text\n', 'Security Contract'), false);
});

test('hasContractSection returns true for an exact match', () => {
  assert.equal(hasContractSection('# Spec\n## Security Contract\nText\n', 'Security Contract'), true);
});

test('hasContractSection matches when the heading is NOT the first line (CQ-004)', () => {
  const draft = '# Spec\n\n- Track: web\n\n## Security Contract\n\nContent\n';
  assert.equal(hasContractSection(draft, 'Security Contract'), true);
});

test('hasContractSection does not match partial heading', () => {
  assert.equal(hasContractSection('## Security ContractExtra\n', 'Security Contract'), false);
});

// ── hasOwnershipLine ──────────────────────────────────────────────────────────

test('hasOwnershipLine returns false when line is absent', () => {
  assert.equal(hasOwnershipLine('# Spec\n', 'Security Reviewer'), false);
});

test('hasOwnershipLine returns true for a matching ownership line', () => {
  const draft = '  - Security Reviewer: owns the exec and threat model\n';
  assert.equal(hasOwnershipLine(draft, 'Security Reviewer'), true);
});

test('hasOwnershipLine matches when line is NOT the first line (CQ-004)', () => {
  const draft = '# Spec\n\n- Documentation owned by each review persona:\n  - Web Architect: owns routes\n  - Security Reviewer: owns exec\n';
  assert.equal(hasOwnershipLine(draft, 'Security Reviewer'), true);
});

test('hasOwnershipLine returns false for an incomplete ownership pattern', () => {
  // No ": <text>" portion — just the bullet with no content
  assert.equal(hasOwnershipLine('  - Security Reviewer: \n', 'Security Reviewer'), false);
});

// ── analyze ───────────────────────────────────────────────────────────────────

const MANIFEST = [
  { name: 'Security Reviewer', contractHeading: 'Security Contract' },
  { name: 'API Contract Reviewer', contractHeading: 'API Contract' },
];

test('analyze: persona is in field only (inField=true, viaSection=false)', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n';
  const rows = analyze(draft, MANIFEST);
  const sr = rows.find((r) => r.name === 'Security Reviewer');
  assert.equal(sr.inField, true);
  assert.equal(sr.viaSection, false);
  assert.equal(sr.effective, true);
  assert.equal(sr.hasOwnership, false);
});

test('analyze: persona is via section only (inField=false, viaSection=true)', () => {
  const draft = '# Spec\n## Security Contract\nContent\n';
  const rows = analyze(draft, MANIFEST);
  const sr = rows.find((r) => r.name === 'Security Reviewer');
  assert.equal(sr.inField, false);
  assert.equal(sr.viaSection, true);
  assert.equal(sr.effective, true);
});

test('analyze: persona is both in field and via section (inField=true, viaSection=true)', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n## Security Contract\nContent\n';
  const rows = analyze(draft, MANIFEST);
  const sr = rows.find((r) => r.name === 'Security Reviewer');
  assert.equal(sr.inField, true);
  assert.equal(sr.viaSection, true);
  assert.equal(sr.effective, true);
});

test('analyze: persona is neither in field nor via section (effective=false)', () => {
  const draft = '# Spec\n- Optional reviewers: none\n';
  const rows = analyze(draft, MANIFEST);
  const sr = rows.find((r) => r.name === 'Security Reviewer');
  assert.equal(sr.inField, false);
  assert.equal(sr.viaSection, false);
  assert.equal(sr.effective, false);
  assert.equal(sr.hasOwnership, false);
});

test('analyze: hasOwnership=true when ownership line exists', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n  - Security Reviewer: owns exec\n';
  const rows = analyze(draft, MANIFEST);
  const sr = rows.find((r) => r.name === 'Security Reviewer');
  assert.equal(sr.hasOwnership, true);
});

// ── toggleOn ──────────────────────────────────────────────────────────────────

test('toggleOn creates the field line when absent', () => {
  const draft = '# Spec\n- Track: web\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  assert.ok(result.includes('- Optional reviewers: Security Reviewer'), result);
});

test('toggleOn replaces "none" with the persona name', () => {
  const draft = '# Spec\n- Optional reviewers: none\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  assert.ok(result.includes('- Optional reviewers: Security Reviewer'), result);
  assert.ok(!result.includes('none'), result);
});

test('toggleOn appends to an existing list', () => {
  const draft = '# Spec\n- Optional reviewers: API Contract Reviewer\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  assert.ok(result.includes('API Contract Reviewer'), result);
  assert.ok(result.includes('Security Reviewer'), result);
});

test('toggleOn does not duplicate when persona already in list', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  const count = (result.match(/Security Reviewer/g) || []).length;
  assert.equal(count, 1);
});

test('toggleOn inserts ownership placeholder under Documentation marker', () => {
  const draft =
    '# Spec\n- Optional reviewers: none\n- Documentation owned by each review persona:\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  assert.ok(result.includes('  - Security Reviewer: <describe what this reviewer owns>'), result);
});

test('toggleOn does not insert duplicate ownership placeholder when one exists', () => {
  const draft =
    '# Spec\n- Optional reviewers: none\n- Documentation owned by each review persona:\n  - Security Reviewer: owns exec\n';
  const result = toggleOn(draft, 'Security Reviewer', MANIFEST);
  const count = (result.match(/- Security Reviewer:/g) || []).length;
  assert.equal(count, 1);
});

test('toggleOn never mutates the input string', () => {
  const draft = '# Spec\n- Optional reviewers: none\n';
  const original = draft;
  toggleOn(draft, 'Security Reviewer', MANIFEST);
  assert.equal(draft, original);
});

// ── toggleOff ─────────────────────────────────────────────────────────────────

test('toggleOff removes the persona from the field', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer, API Contract Reviewer\n';
  const result = toggleOff(draft, 'Security Reviewer');
  assert.ok(!result.includes('Security Reviewer'), result);
  assert.ok(result.includes('API Contract Reviewer'), result);
});

test('toggleOff sets field to "none" when last persona is removed', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n';
  const result = toggleOff(draft, 'Security Reviewer');
  assert.ok(result.includes('- Optional reviewers: none'), result);
});

test('toggleOff leaves ownership lines untouched', () => {
  const draft =
    '# Spec\n- Optional reviewers: Security Reviewer\n  - Security Reviewer: owns exec\n';
  const result = toggleOff(draft, 'Security Reviewer');
  assert.ok(result.includes('  - Security Reviewer: owns exec'), result);
});

test('toggleOff returns input unchanged when field is absent', () => {
  const draft = '# Spec\n';
  assert.equal(toggleOff(draft, 'Security Reviewer'), draft);
});

test('toggleOff never mutates the input string', () => {
  const draft = '# Spec\n- Optional reviewers: Security Reviewer\n';
  const original = draft;
  toggleOff(draft, 'Security Reviewer');
  assert.equal(draft, original);
});
