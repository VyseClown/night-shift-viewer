# Night-Shift Workflow — Verified Reference

This is the authoritative model of the night-shift overnight workflow, derived
from `scripts/night-shift.sh` (the orchestrator) and cross-checked against a real
archived run (`rn-sandbox/.night-shift/archive/20260606T053032Z-88388/`).

All `sh:NNN` citations refer to `night-shift.sh` **as of the 2053-line revision
(multi-track rn/web support)**. Section 3 documents the track model. Line numbers
elsewhere are accurate to that revision but may drift ±a few lines on future
edits. This document is the contract the viewer is built against. The
orchestrator itself is never modified.

---

## 0. Six findings that shape the viewer

1. **The observer-approved commit is not always the branch HEAD.** In the real
   run the observer APPROVED `ba0b987` (8 files); the primary then `git commit
   --amend`ed to add `CHANGELOG.md`, producing `9cb4e17` (9 files), now HEAD.
   `ba0b987` is a **dangling commit** (`git fsck` confirms) — still diffable but
   GC-prunable (~30 days). The viewer needs a diff fallback chain and a
   "approved state differs from HEAD" banner.
2. **`review_round` is a single global counter across both review stages.** Real
   data: plan = `round-1`,`round-2`; implementation = `round-3`,`round-4`. Label
   rounds by directory path (`plan/` vs `implementation/`), not by the number.
3. **`compact_success` keeps only `{state.json, summary.json, validated/}`.**
   Everything else is deleted on a successful run. **Blocked runs keep the full
   tree; `summary.json` exists only on complete.** Read live/blocked runs from
   top-level `.night-shift/`; read finished runs from `archive/<run-id>/`.
4. **The stored `*.patch` is primary-authored, not script-generated.** A useful
   git-independent fallback diff *when present*, but not guaranteed.
5. **Archived state can have accounting anomalies** (`primary_turns=11` vs
   Σ`stage_counters`=10; `observer_review` counter 1 despite two candidates).
   The viewer must tolerate imperfect internal consistency.
6. **Wall-clock time ≠ active time.** The real 19h span was ~11.6h of rate-limit
   sleep (budget-excluded) around ~7.6h of work. For `waiting` runs, show the
   frozen `rate_limit_*_elapsed`, not `now - started_at`.

---

## 1. Run state machine

**Stages** (inner `state.stage`):
`planning → plan_review → implementation → implementation_review →
implementation_ready → observer_review → completion`

`plan_review` and `implementation_review` are **transient** wrapper-owned states
— the primary never takes a turn in them (their `stage_counters` stay 0). Render
them as brief transitions, not dwell states.

**Transitions** (`transition_allowed` sh:1497; dispatch in `handle_signal`):

| Stage | Action | Effect |
|---|---|---|
| planning / plan_review | RUN_PERSONAS | `run_personas`: any BLOCK → planning; all APPROVE → `plan_approved=true`, implementation |
| implementation / implementation_review | RUN_PERSONAS | any BLOCK → implementation; all APPROVE → `implementation_approved=true`, implementation_ready |
| implementation_ready | CREATE_CANDIDATE | `verify_candidate` → observer_review |
| observer_review | REQUEST_OBSERVER | APPROVE → completion; BLOCK → implementation (resets `implementation_approved`, `candidate_verified`) |
| completion | NEXT_TASK | `start_next_task` → planning (task-scoped state reset) |
| completion | COMPLETE | `complete_run` → archive + exit 0 |
| any | BLOCKED | `block_run` → exit 1 |

A malformed/missing next-action signal does **not** change stage; the loop
re-invokes the same pinned session (sh:1872–1882).

**Run status** (`state.status`, orthogonal to stage):

| status | set at | meaning |
|---|---|---|
| `running` | sh:1122, 290, 1178 | primary active / about to be invoked |
| `waiting` | sh:271 | sleeping for a 429 rate-limit reset; `rate_limit_reset_at` set |
| `blocked` | sh:1347 | terminal; `block_reason` set; needs human |
| `complete` | sh:1751 | all tasks done, archived, exit 0 |

---

## 2. state.json fields

| Field | Type | Notes |
|---|---|---|
| `run_id` | string | `YYYYMMDDTHHMMSSZ-<pid>`; stable across recovery |
| `status` | string | running / waiting / blocked / complete |
| `primary`, `observer` | string | always `"claude"` |
| `session_id` | string\|null | pinned `--resume` session; null before first turn |
| `task` | string | absolute spec path; changes on NEXT_TASK |
| `stage` | string | see §1 |
| `primary_turns` | int | run-lifetime total (never reset) |
| `task_turns`, `stage_turns` | int | reset on NEXT_TASK / restored per stage |
| `review_round` | int | **global** across plan+impl; reset on NEXT_TASK |
| `stage_counters` | obj | stage → accumulated turns |
| `stage_started` | obj | stage → epoch of last entry (rebased on recovery) |
| `stage_started_at`, `task_started_at` | int(epoch) | fresh per stage entry / per task |
| `started_at`, `updated_at`, `completed_at` | ISO | wall clock |
| `base_commit`, `base_branch` | string | HEAD/branch at task start |
| `baseline_status` | string | path to `baseline-status*.txt` |
| `candidate_commits` | string[] | insertion-order, deduped; `[-1]` = latest |
| `candidate` | string | explicit latest candidate |
| `finding_ids` | string[] | union of all finding IDs (never shrinks) |
| `plan_approved`, `implementation_approved`, `candidate_verified`, `baseline_complete` | bool | gates (all four true before CREATE_CANDIDATE) |
| `block_reason` | string | only when blocked |
| `validation_worktree` | string | transient; temp worktree path during verify |
| `rate_limit_reset_at`, `rate_limit_stage_elapsed`, `rate_limit_task_elapsed` | int | only while waiting |

Gates: `plan_approved` set sh:1601, `implementation_approved` sh:1604 (reset on
observer BLOCK sh:1804), `candidate_verified` sh:1711 (reset sh:1804),
`baseline_complete` sh:1308. All checked sh:1623.

---

## 3. Review subsystem

### Tracks (added in the 2053-line revision)

A spec declares `- Track: rn | web` (default **`rn`** when the field is absent —
backward compatible; `spec_track` sh:1063). The track selects **which persona set
and floor** apply, so a React Native spec and a web spec each get reviewers that
fit the stack. Unknown tracks are rejected (`resolve_active_personas` sh:1082).

| | `rn` track | `web` track |
|---|---|---|
| **Personas** (6) | Mobile UX Designer, React Native Architect, Mobile Domain Expert, TypeScript & Code Quality Expert, Performance Expert, Human Advocate | Web UX & Accessibility Designer, Web Architect, Backend & Data Expert, TypeScript & Code Quality Expert, Performance Expert, Human Advocate |
| **Floor** | React Native Architect, TS & Code Quality, Human Advocate | Web Architect, TS & Code Quality, Human Advocate |
| **Profiles** | full / frontend / logic / native | full / frontend / logic / data |

`PERSONAS` (sh:29) is the union of both tracks' six personas **plus the two
optional personas (11 names)**, used *only* for the persona-review schema
membership check. The per-track sets/floors (`persona_set`, `persona_floor`
sh:1016–1030) drive what a spec actually runs (see **Optional personas** below
for how the two extras opt in).

**Profiles → active personas** (`profile_personas(profile, track)` sh:1045–1058):

| Profile | rn | web |
|---|---|---|
| `full` | all 6 rn | all 6 web |
| `frontend` | floor + Mobile UX Designer + Performance Expert | floor + Web UX & Accessibility Designer + Performance Expert |
| `logic` | floor + Performance Expert | floor + Performance Expert |
| `native` (rn only) | floor + Mobile Domain Expert | ✗ rejected |
| `data` (web only) | ✗ rejected | floor + Backend & Data Expert |

Track-specific profiles do not cross tracks (`native` is rn-only, `data` is
web-only). The floor is runtime-asserted on every resolve (sh:1092–1102). Real
archived run = `rn` / `full`.

**Optional personas** (`PERSONAS_OPTIONAL`, `spec_optional_personas`): two
cross-track reviewers — **Product Reviewer** and **Design Fidelity Reviewer** —
that belong to no track/profile set or floor. A spec opts in either by listing
them in an `- Optional reviewers:` field or by including a `## Product Contract`
/ `## Design Contract` section (a heading auto-activates the matching reviewer).
`resolve_active_personas` unions any opted-in optional persona onto the profile
set (deduped, order-preserving) after the floor guard; a spec that opts into
neither resolves to exactly the plain profile set (zero behavior change). An
unknown optional reviewer aborts resolution and is rejected by the prompt, the
gate, and `validate_spec` (with a specific "unknown optional reviewer" message).
Scope today is text/traceability review; screenshot/pixel-diff visual validation
is a documented follow-up. The viewer's persona matrix is data-driven, so it
renders these automatically when present.

> **Schema enum (resolved):** `schemas/persona-review.json`'s `persona` enum
> lists the **9-persona union** of both tracks **plus the 2 optional personas
> (11 names total)**, matching the inline `$PERSONAS` union; the vendored copy is
> re-synced to upstream and byte-identical. So validating a persona file against the vendored enum is now
> safe for both tracks. Per-track/profile correctness is still enforced by the
> script (`resolve_active_personas` + the exact per-track set gate), not by this
> enum — the enum only bounds the universe of valid persona names. The viewer's
> persona matrix remains data-driven, so it renders both tracks regardless.

**Persona gate** (`run_personas` sh:1561–1610): exact count + exact active-set +
stage match; any single BLOCK sends the stage back; `record_findings` runs every
round (findings accumulate, never removed). Results land at
`validated/personas/<spec-stem>/<plan|implementation>/round-<N>/<persona>.json`
(path unchanged across the revision; sh:1567).

**persona-review.json**: `{persona, stage(plan|implementation), commit(null|hash),
status(APPROVE|BLOCK), findings[], documentation_changes[]}`; finding id
`^[A-Z][A-Z0-9_-]*-[0-9]{3,}$`; APPROVE⇔0 findings, BLOCK⇔≥1.

**Observer** (`run_observer` sh:1770): fresh Claude session, neutral empty
cwd, no `--resume`, default permission mode → cannot read the repo, judges only
supplied evidence. Verdict extracted from `.result` (whole-JSON → last fenced
```json``` block → embedded `{...}`; `extract_claude_structured` sh:1536),
then `normalize_observer_output` (sh:1815) coerces synonyms
(`REQUEST_CHANGES`→BLOCK), pads ids to `OBS-NNN`, strips unknown keys, and can
**fabricate fallback evidence** ("see observer notes") — so the gate is softer
than the schema implies. One retry (`validated_observer_retry`), else block.
Output: `validated/observer-<commit>.json`; appended to `NIGHT_SHIFT_REVIEW.md`.

**observer-review.json**: `{observer:"claude", primary:"claude", task,
candidate_commit(^[0-9a-f]{7,64}$), status, findings[](OBS-NNN),
documentation_changes[]}`.

**Stall detection**: fingerprint per finding (`required_change | material_token`;
observer adds `evidence_hash`); 3 unchanged rounds → block (`detect_stalled_*`,
`bump_finding_history` sh:789–801). `material_token` = `git diff BASE_COMMIT` of
the **working tree** (sh:763–765) — changed code/tests reset the counter.

**Real run review map**: plan r1 → 4 BLOCK / 2 APPROVE (8 findings: UX-001/002,
TS-001/002, PERF-001, HA-001/002/003) → plan r2 all APPROVE → impl r3 all APPROVE
→ impl r4 all APPROVE (commit `ba0b987`) → observer APPROVE.

---

## 4. Validation & candidate verification

`verify_candidate` (sh:1461–1554) is a 20-step gauntlet, each step its own
`block_run`. Integrity core: the wrapper **independently re-runs** test-first
(must pass in an isolated detached worktree at the candidate, deps symlinked via
`link_worktree_dependencies`) and final validation, then asserts the primary's
evidence matches **by `{command, exit_status}` only** (never output text — that's
why the primary's `failing_output` legitimately differs from the wrapper's).
`validation_not_regressed` (sh:1069–1079) tolerates pre-existing same-exit
failures but blocks new/worsened ones. Exit-127 anywhere = missing tool = hard
block (`tools_available` sh:755–757).

**execution-evidence.json**: `{task, baseline[], test_first{command,
failing_exit_status≥1, failing_output, passing_exit_status==0, passing_output},
final_validation[]}`; array items `{command, exit_status≥0, output}`.

**Real run**: baseline 3×green (4 suites/6 tests) → test-first red (exit 1, "no
tests found") → after impl green (exit 0, 7 tests) → final 3×green (5 suites/13
tests). Commands: `npm run typecheck`, `npm run lint`, `npm test`; test-first
`npm test -- --testPathPattern toggleTodo`.

---

## 5. Artifacts & lifecycle

Under `<project>/.night-shift/` (git-ignored):

| Path | Lifecycle |
|---|---|
| `state.json` | live; copied to archive then deleted on success; kept on block |
| `summary.json` | only on COMPLETE; copied to archive |
| `control/`, `raw/`, `prompts/`, `*-history-*.json`, `baseline-status*.txt`, `worktrees.txt` | live only; **deleted** by compact_success |
| `validated/baseline.json`, `final.json`, `test-first-*.json` | copied to archive |
| `validated/execution-<commit>.json`, `observer-<commit>.json` | one per candidate / observer run; archived |
| `validated/personas/<spec>/<stage>/round-N/*.json` | archived |
| `validated/*.patch`, `*-execution-evidence.json` | primary-authored; archived if present |
| `archive/<run-id>/{state.json, summary.json, validated/}` | permanent (success only) |

`compact_success` (sh:803–814) copies `{state.json, summary.json, validated/}`
into `archive/<run-id>/` then deletes everything else except `archive/`.
`block_run` never archives — the full live tree is preserved for recovery.

**Reading rule for the viewer**: finished runs → `archive/<run-id>/`; live/blocked
runs → top-level `.night-shift/` (no `summary.json`; derive a summary from
`state.json`).

---

## 6. Git / candidate model & diff sources

`base_commit`/`base_branch` = HEAD/branch at task start (sh:1116–1117).
`candidate_commits[]` grows by insertion-order dedup as each candidate passes
`verify_candidate` (sh:1545); multiple entries mean the observer blocked at least
once or the primary amended. Entries can become **dangling** after `--amend`.

**Diff fallback chain** (what the viewer's diff endpoint implements):

1. `git diff <base>..<HEAD>` — always works (HEAD is a live ref).
2. `git diff <base>..<observer-approved commit>` — the commit named in
   `observer-<hash>.json`; GC-aware (may be dangling but still in the object
   store). If it differs from HEAD, show a banner.
3. Stored `validated/*.patch` — git-independent, if present.

Real run: HEAD `9cb4e17` (9 files) vs observer-approved `ba0b987` (8 files,
dangling) — differ only by `CHANGELOG.md`.

---

## 7. Rate-limit, recovery, limits

- **429 handling** (`is_rate_limit_response` sh:167; `wait_for_rate_limit_reset`
  sh:244–295): strict parse of a 12h-clock reset time + IANA timezone → epoch;
  status `waiting`; **budget rebase** so wait + offline time is excluded from
  caps (`started_at = now - active_elapsed`). Runaway cap
  `RATE_LIMIT_MAX_WAIT_SECONDS` (6h) → block.
- **Recovery** (`recover_run` sh:1151; `recoverable_rate_limit_state` sh:227):
  resumes the same pinned session; rebases clocks to exclude downtime.
- **Limits** (sh:13–16): stage 12 turns / 1h, task 36 turns / 3h
  (`limit_exceeded` sh:744; `enforce_limits` / `enforce_elapsed_limits`). Env
  overrides `NIGHT_SHIFT_MAX_*`.
- **Cost**: subscription (no `ANTHROPIC_API_KEY`) burns plan usage; API key bills
  per token. `full` = 6 personas × 2 stages + observer per task.

---

## 8. Viewer UI implications (summary)

- **Status badge** (running/waiting/blocked/complete) **and** stage pipeline,
  shown separately. For `waiting`, show countdown from `rate_limit_reset_at` and
  frozen elapsed.
- **Gate checklist**: baseline / plan / implementation / candidate. Observer
  BLOCK flips the last two false — surface prominently.
- **Budget meters**: stage turns/time, task turns/time, against the caps.
- **Persona matrix**: round × persona × stage; APPROVE/BLOCK; finding drill-down;
  label rounds by directory (`plan`/`implementation`), not raw `review_round`.
- **Finding lifecycle**: open = in latest BLOCK; closed = in `finding_ids` but not
  current. Show stall counters (warn at 2).
- **Observer panel**: verdict, findings, and a banner if the approved commit ≠
  HEAD.
- **Evidence panel**: baseline vs final (regression-aware), test fail→pass proof,
  and "primary-claimed vs wrapper-verified" cross-check indicator.
- **Diff viewer**: per-file unified/split, using the §6 fallback chain; flag
  dangling/superseded commits.
- **Tolerate anomalies**: never assert Σ`stage_counters` == `primary_turns`, etc.
