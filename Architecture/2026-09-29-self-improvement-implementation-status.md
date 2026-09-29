# DataNexus self-improvement implementation status

Updated 2026-09-29. This document records the implementation boundary for governed self-improvement. It is an evidence contract, not a claim that the agents have already improved.

## Current implementation

DataNexus now has the building blocks for a closed learning loop:

1. Verified governed outcomes remain the source of outcome truth.
2. PGCL records immutable production eligibility for the source agent run.
3. Held-out learning benchmarks require temporal ordering and independently persisted baseline and candidate evaluation rows for every case.
4. A proposed candidate follows the existing review, approval, canary, activation, and rollback lifecycle.
5. Verified production outcomes are collected by source agent, agent version, and explicit run mode.
6. The prospective collector includes effective, ineffective, partial, failed, rejected, policy-blocked, rolled-back, unknown, and unclassified results in the denominator. A technically successful run is not automatically treated as effective.

## Runtime binding

The PGCL runtime calls `record_pgcl_run_learning_provenance` before persisting a candidate derived from a verified agent run. The prospective-outcome migration adds two idempotent database collection paths:

- an outcome-insert trigger, which records an outcome when production provenance already exists;
- a provenance-insert trigger, which backfills verified outcomes when provenance is recorded after the outcome.

This ordering is intentional because governed outcome recording and PGCL provenance can occur in either order. The collector skips unverified outcomes, runs without production eligibility, and source runs that cannot be resolved in the same project. It records an unrecognized or missing run mode as `UNCLASSIFIED` instead of guessing.

## Required evidence dimensions

The evaluation and prospective result surfaces must be reported separately for each applicable combination:

| Dimension | Required treatment |
| --- | --- |
| Agent | Canonical agent key from the immutable agent definition |
| Version | Agent definition version at source-run time |
| Run mode | Explicit `learningRunMode` or `run_mode`; conflicting or missing values become `UNCLASSIFIED` |
| Outcome | Verified governed outcome type, including negative and inconclusive outcomes |
| Effectiveness | Nullable verified score from 0 to 1; null is not converted to success |
| Provenance | Production-eligible, non-synthetic source run only |
| Time | Verified timestamp and immutable recorded timestamp |

Missing agents and modes are reported as missing evidence. They are not filled with zeroes and must not be described as regressions or improvements.

## Completion gates

The self-improvement task is complete only when all of the following are true:

- the database migrations are deployed to the isolated test database and schema health reports the required tables and functions;
- a held-out dataset snapshot and split manifest are registered independently of candidate evidence;
- every paired benchmark case has two evaluation rows, with no training overlap or source-evidence reuse;
- each applicable agent and run mode has prospective verified outcomes, including failed and inconclusive outcomes;
- an independently reviewed candidate improves the predeclared quality metric without a safety, policy, authority, cost, or latency regression;
- controlled release and rollback evidence are recorded;
- only then may DataNexus describe that agent and version as empirically self-improving.

Until those gates are met, the correct status is `IMPLEMENTED_INFRASTRUCTURE_NO_PROSPECTIVE_PROOF`.

## Takeover hardening completed

The takeover pass closed two implementation defects discovered during exact-head review:

- Released migration immutability is restored. The historical PGCL provenance migration is byte-identical to `main`; terminal-run provenance is introduced by the forward-only migration `20260929000225_pgcl_terminal_run_learning_provenance.sql`.
- Prospective outcome collection now handles both immediate verified inserts and later transitions to `VERIFIED`. Run-mode parsing is normalized consistently, and terminal-run denominator coverage derives verified-versus-pending state from immutable prospective outcome evidence instead of mutating the terminal ledger.

The resulting implementation remains deliberately non-authoritative: terminal provenance places failures, partial runs, and cancellations into the measurement denominator, but does not turn them into positive learning cases. Production activation, merge, or deployment is not authorized by this document.

## Verification

Run the focused contract check with:

```bash
npm run verify:governed-learning-prospective-outcomes
```

The test is intentionally structural. It verifies the persistence, ordering, immutability, negative-outcome accounting, and runtime binding contract. It does not manufacture production results and therefore cannot substitute for live governed outcomes.

## Zero-additional-cost test sequence

The existing decision in `Major discussion/2026-09-11-session-summary-recovery-ux-and-next-plan.md` favors clean migration reconstruction and isolated local or CI rehearsal over a billable Supabase branch. A paid branch is optional for a later full hosted preview, not a prerequisite for the current implementation gate.

1. Use the clean Supabase reconstruction workflow and the isolated PostgreSQL CI fixture to apply migrations and exercise the real manifest registration and paired-binding triggers. CI supplies a disposable database without changing the connected Supabase project.
2. Register a sealed benchmark manifest with independent `TRAINING` and `HELD_OUT` cases and a source evidence cutoff before candidate creation. Record its hash.
3. Run the baseline and candidate against each held-out case under an independent evaluator. Persist both evaluation rows and their distinct evidence references before recording the aggregate benchmark.
4. Exercise every applicable agent and explicit run mode with controlled test runs. Check failed, partial, cancelled, blocked, and unknown outcomes, delayed verification, conflicting run modes, and synthetic exclusion.
5. Inspect read-only Command Center coverage by agent, version, and mode. Missing cells remain missing evidence. Preserve test artifacts and negative-path evidence.
6. Review candidate safety, authority, policy, cost, latency, and rollback evidence before a controlled production canary. Only real verified outcomes on future comparable work can demonstrate improvement.

A `test` schema inside the connected production project can hold narrowly scoped disposable tables and queries at no extra branch charge. It shares the same database, roles, Auth, extensions, compute, and project configuration, so it cannot validate a full migration replay or serve as an isolated application environment. Do not copy the agent/governance migrations into `test` and interpret that as production parity. The CI fixture now covers the database rules at no additional Supabase branch charge. It does not manufacture prospective production outcomes or validate a hosted preview. Production merge, migration, candidate activation, and cutover are separate release actions.

### Existing `testing` schema inventory and options, 2026-09-29

Read-only inspection of the connected project found `testing.fixture_runs` and `testing.fixture_assertions`, with four synthetic smoke runs and four assertions. Both tables have RLS enabled, no authenticated or anonymous schema usage, and service-role access. The run table enforces `synthetic = true` and currently permits `OFF`, `GUIDED`, `GOVERNED_AUTO`, and `FULL_AUTONOMOUS`; it cannot represent `SUPERVISED` or `HANDSFREE` without a schema change. These records are fixture evidence only.

| Option | Can verify | Cannot establish | Current choice |
| --- | --- | --- | --- |
| Existing private `testing` schema | Narrow synthetic assertions, negative paths, fixture bookkeeping, and service-role access boundaries | Clean replay of migrations that create objects in `agent` and `governance`, separate Auth/API/runtime configuration, or real prospective effectiveness | Use for bounded fixture evidence without modifying existing mode constraints merely to imply coverage |
| Isolated CI PostgreSQL and Supabase reconstruction | Real migration ordering, manifest registration, paired-binding triggers, rollback, leakage rejection, and schema health | Hosted preview behavior or production improvement | Default no-additional-Supabase-charge database test path; the exact PR head passed its database fixture and reconstruction jobs |
| Existing `DataNexus UX E2E Controlled` project | Potential hosted UI and Auth test after deliberate reconciliation | Immediate schema parity; only four migrations are recorded there versus 470 in the connected main project | Do not silently repurpose or assume parity |
| New paid preview branch | Separate hosted DB, Auth, API keys, and configuration for full preview | Real production improvement from synthetic runs | Optional only if a later hosted test requires it and its hourly cost is explicitly accepted |

No paid branch or production schema change is needed for the current implementation tests. None of these synthetic environments can satisfy the prospective production-outcome gate for all eight agents and applicable run modes.
