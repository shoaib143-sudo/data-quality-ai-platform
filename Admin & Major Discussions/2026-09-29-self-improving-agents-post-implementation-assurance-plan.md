# Self-Improving Agents — Post-Implementation Assurance Plan

**Date:** 2026-09-29  
**Scope:** PR #1078 — governed self-improvement infrastructure for the eight DataNexus agents  
**Boundary:** Non-production assurance only. This document does not authorize merge, production migration deployment, candidate activation, or production cutover.

## 1. Purpose

This plan defines the mandatory post-implementation assurance sequence after the self-improvement capability is code-complete. It is designed to prove that the implementation is internally consistent, fail-closed, resistant to benchmark leakage and authority escalation, observable, and safe to advance to a separately authorized controlled-live phase.

The assurance sequence is:

1. exact-head re-validation;
2. independent adversarial audit;
3. unit and contract test confirmation;
4. integration and database reconstruction validation;
5. negative and failure-path execution;
6. evidence reconciliation;
7. release-readiness decision.

No single green workflow is sufficient. Advancement requires the aggregate evidence set to remain green on one exact immutable head.

## 2. Acceptance model

| Gate | Required evidence | Pass criterion | Failure action |
|---|---|---|---|
| Exact-head integrity | PR head SHA, current-main relationship, workflow SHA match | All evidence refers to the same head | Stop; refresh from main and restart assurance |
| Unit/contract tests | Learning candidate, benchmark, paired evaluation, prospective outcomes, coverage, observability tests | 100% pass | Stop; repair and rerun |
| Database reconstruction | Full migration reconstruction and authority/profiling matrices | Clean reconstruction; no historical migration mutation | Stop; add forward migration only |
| Independent adversarial audit | Separate adversarial workflow/tests not sharing success criteria with implementation path | No bypass of leakage, authority, approval, provenance, rollback, or denominator controls | Stop; remediate before release |
| Negative/failure cases | Explicit rejected/broken scenarios | Every prohibited scenario fails closed | Stop; add regression case and repair |
| Security | CodeQL + dependency audit + least-privilege workflow posture | No blocking finding | Stop; remediate |
| Governance | Repository Governance + Release Governance + P0-P5 | All required checks pass | Stop; do not advance |
| Prospective proof boundary | Evidence that no synthetic/retrospective result is represented as real improvement | Boundary preserved | Stop; correct status/evidence claims |
| Deployment boundary | Production/canary deploy jobs | Skipped unless separately authorized | Stop if unintended deployment occurs |

## 3. Re-validation plan

Re-validation must be run after implementation completion and after every material change, merge-from-main, migration edit, or test-logic edit.

### 3.1 Exact-head checks

- Capture the PR head SHA before validation.
- Verify the PR is current with `main` or document the delta and refresh the branch.
- Confirm every cited workflow run uses the same head SHA.
- Reject evidence from superseded heads.
- Confirm no historical released migration is modified.
- Confirm all new schema changes are forward-only migrations.

### 3.2 Mandatory re-validation workflows

The following must be green on the exact head before the implementation may be called post-implementation validated:

- Continuous Learning Governance
- V6 Operational Certification
- Repository Governance
- P0-P5 Revalidation
- Quality Gate
- Dependency Security Audit
- Autonomous Agent Governance
- CodeQL Security
- Release Governance
- Delegation Administration Policy / authority-runtime database reconstruction

A duplicate or superseded run may be cancelled without invalidating the gate only if another run for the same exact head completed successfully and the cancellation is documented.

## 4. Independent adversarial audit

The adversarial audit must attempt to disprove the safety and validity of the implementation rather than repeat happy-path tests.

### 4.1 Benchmark and evaluation attacks

Attempt all of the following:

- use evidence generated after the benchmark cutoff;
- reuse TRAINING cases in HELD_OUT evaluation;
- alter or mismatch dataset manifest hashes;
- bind a candidate evaluation without a baseline pair;
- bind mismatched baseline/candidate case identities;
- omit required evaluator dimensions;
- pass fewer than the governed minimum case count;
- report a quality gain while safety/authority failures regress;
- promote based on synthetic, retrospective, or unverifiable outcomes;
- count failed/partial/cancelled runs as positive outcomes;
- exclude failed/partial/cancelled runs from the prospective denominator;
- double-count one terminal run;
- exploit a terminal-to-terminal status transition to create duplicate evidence.

Expected result: every attack is rejected or represented only as non-positive denominator evidence.

### 4.2 Governance and authority attacks

Attempt:

- agent self-approval of its own candidate;
- candidate promotion without independent evaluator evidence;
- release without current authorization;
- authority expansion through a learning proposal;
- mutation-boundary expansion through a learning proposal;
- release without rollback evidence;
- candidate activation before required approval;
- evidence mutation after persistence;
- conflict between `learningRunMode` and `run_mode`;
- unsupported run mode injection.

Expected result: fail closed, with conflicting/unsupported modes becoming `UNCLASSIFIED` where applicable rather than gaining authority.

### 4.3 Provenance attacks

Attempt:

- verified outcome with missing governed source-run provenance;
- delayed verification after original outcome insertion;
- synthetic source run presented as prospective production proof;
- precedent retrieval represented as applied learning;
- outcome attributed to a version that did not influence execution.

Expected result: unverifiable evidence does not become positive prospective improvement evidence; delayed legitimate verification is collected exactly once.

## 5. Unit and contract testing plan

### 5.1 Core learning tests

Mandatory test surfaces:

- governed learning candidate rules;
- governed benchmark rules;
- paired baseline/candidate benchmark binding;
- immutable evaluation ledger;
- governed benchmark dataset manifest;
- temporal-integrity and leakage adversarial tests;
- prospective outcomes;
- terminal outcome coverage;
- prospective Command Center state;
- release approval;
- controlled release and rollback;
- PGCL provenance;
- execution attribution;
- eight-agent PGCL conformance.

### 5.2 Required assertions

At minimum, tests must prove:

- all eight governed agents remain registered;
- agents may propose improvements but may not self-promote;
- required evaluator dimensions cannot be omitted;
- held-out data remains sealed from training;
- case identity is deterministic and hash-bound;
- baseline and candidate evidence are independently persisted;
- historical benchmark evidence cannot be backfilled into a candidate;
- negative terminal outcomes remain in the denominator;
- terminal capture is idempotent one-row-per-run;
- insert-directly-terminal and update-to-terminal paths both work;
- delayed transition to VERIFIED is captured;
- conflicting modes are not silently resolved in favor of higher authority;
- release approval requires current governed authorization;
- rollback remains available before activation.

## 6. Negative and failure-path matrix

| Scenario | Expected behavior |
|---|---|
| Held-out case appears in training partition | Reject manifest/evaluation |
| Candidate evidence timestamp precedes allowed temporal boundary incorrectly | Reject |
| Evidence source reused across baseline and candidate where independence is required | Reject |
| Baseline evidence missing | Candidate cannot qualify |
| Candidate evidence missing | Candidate cannot qualify |
| Manifest hash mismatch | Reject |
| Dataset modified after sealing | Reject |
| Evaluator not independent | Release gate fails |
| Minimum case count not reached | Release gate fails |
| Quality improves but authority/safety regresses | Release gate fails |
| Cost or latency exceeds declared threshold | Candidate not promoted |
| Failed/PARTIAL/CANCELLED run | Included in denominator; never positive by status alone |
| Same run reaches multiple terminal states | One immutable coverage row |
| Outcome verified later | Collect once on VERIFIED transition |
| Unsupported/conflicting run modes | UNCLASSIFIED / non-authoritative handling |
| Missing source-run provenance | No positive prospective proof |
| Synthetic run | No production-improvement claim |
| Agent tries to approve its own release | Reject |
| Agent tries to expand tool/mutation authority | Reject |
| Approval stale or revoked at release | Reject |
| Rollback evidence missing | Release blocked |
| Historical migration edited | Release Governance fails |
| Database reconstruction fails | Stop release progression |
| CodeQL/dependency finding is blocking | Stop release progression |
| Workflow/test cancelled with no same-head successful equivalent | Gate remains incomplete |
| Production deploy unexpectedly starts from assurance PR | Stop and investigate |

## 7. Evidence reconciliation

After tests complete:

1. enumerate all exact-head workflow runs;
2. separate success, failure, cancelled, skipped, and active states;
3. verify that each mandatory gate has at least one same-head successful run;
4. inspect any cancellation and document why it does or does not invalidate the gate;
5. confirm production deployment jobs were skipped;
6. confirm PR body and status comments do not overclaim empirical self-improvement;
7. record the exact SHA and final gate state in the PR.

## 8. Completion states

Use only these statuses:

- `IMPLEMENTATION_COMPLETE_POST_VALIDATED` — all non-production gates pass.
- `IMPLEMENTATION_COMPLETE_ASSURANCE_BLOCKED` — implementation exists but at least one assurance gate is incomplete or failed.
- `CONTROLLED_LIVE_ACTIVATION_AUTHORIZED` — separate explicit authorization exists to cross the deployment boundary.
- `EMPIRICALLY_SELF_IMPROVING` — only after controlled live activation, verified prospective outcomes, contemporaneous baseline/candidate comparison, and sustained improvement without safety/authority/cost/latency regression.

For PR #1078, the correct post-implementation status is **IMPLEMENTATION_COMPLETE_POST_VALIDATED** once the exact-head evidence checklist below remains satisfied. It is not yet **EMPIRICALLY_SELF_IMPROVING**.

## 9. Controlled-live phase prerequisites

The following are deliberately outside this post-implementation assurance phase and require a separate authorization:

- merge into the release path;
- deploy the new migrations into the selected live/test environment;
- register real held-out governed datasets;
- execute real paired baseline/candidate runs;
- start controlled shadow canaries;
- activate a candidate;
- collect prospective real-world outcomes;
- retain or rollback based on observed evidence.

## 10. Stop rules

Immediately stop progression if any of these occur:

- exact-head mismatch;
- benchmark leakage;
- historical migration mutation;
- authority escalation;
- self-approval;
- evidence mutability;
- provenance ambiguity;
- denominator exclusion;
- duplicate terminal evidence;
- failed security/governance gate;
- unintended production deployment;
- inability to distinguish synthetic from real prospective evidence.

No override is allowed merely because aggregate quality improves.
