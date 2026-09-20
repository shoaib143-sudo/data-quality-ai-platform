# DataNexus Functional Implementation Matrix

**Date:** 2026-09-20  
**Scope:** Functional implementation and development-level validation only. Operational certification and production hardening are deferred.

## 1. Current live baseline

Current protected `main` includes:

- governed learning candidate pipeline, PR #816
- governed learning benchmark gate, PR #819
- profiling large-object execution path
- existing governed agent runtime and execution controls
- Job Monitor/domain drilldown foundation
- source onboarding, profiling, findings and score foundations documented in project state

The matrix below is the execution control for closing the remaining product gap.

## 2. Workstream scoreboard

| Stream | Scope | Current status | Planning completion | Exit condition |
|---|---|---|---:|---|
| S1 | Golden Path UX | Active gap | 62% | Source → Dataset → Profiling → Findings → Score → Governance works entirely in UI |
| S2 | Profiling, DQ, Findings, Score, Governance core | Existing strong foundation | 80% | CSV and database flows persist and expose complete deterministic outputs |
| S3 | Governed asset action flow | Partial | 60% | Recommendation → approval when required → agent action → verification → closure |
| S4 | Priority agents: Profiling, DQ, Governance Analyst, Steward | Partial | 65% | Each has functional domain-specific E2E acceptance |
| S5 | Governed learning + PGCL | Implementation underway on main | 60% | Candidate → DG Admin review → approved case → retrieval → measured reuse |
| S6 | Development validation + UI functionality | Continuous | 65% | Unit, contract, integration, negative, failure, E2E and UI interaction tests green |
| S7 | Coordination/contracts/reconciliation | Continuous | 75% | No conflicting contracts/schemas and documentation matches current implementation |

## 3. Golden Path implementation slices

### GP1: Source to Governance

| Slice | Required implementation | Status |
|---|---|---|
| GP1.1 | Source selection / CSV upload / DB source | Existing foundation |
| GP1.2 | Dataset registration | Existing foundation |
| GP1.3 | Dataset version | Existing foundation |
| GP1.4 | Schema discovery | Existing foundation |
| GP1.5 | Profile run creation | Existing foundation |
| GP1.6 | Metric execution | Existing foundation, verify closure |
| GP1.7 | Metric persistence | Existing foundation, verify closure |
| GP1.8 | Findings generation | Existing foundation, verify closure |
| GP1.9 | Quality score | Existing foundation, verify closure |
| GP1.10 | Governance insight | Partial |
| GP1.11 | Basic integrated UX | Gap |
| GP1.12 | UI functional tests | Gap / continuous |

### GP2: Governed Asset Remediation

| Slice | Required implementation | Status |
|---|---|---|
| GP2.1 | Finding → recommendation | Partial |
| GP2.2 | classify action as data / governed asset / DG Admin authority | Gap |
| GP2.3 | block source/business data remediation | Product rule approved, implementation check required |
| GP2.4 | stakeholder approval for governed asset change | Existing approval platform, integration required |
| GP2.5 | DG Admin Handsfree path without additional approval | Product rule approved, integration required |
| GP2.6 | agent action | Partial |
| GP2.7 | post-action verification | Partial |
| GP2.8 | closure / reopen | Gap / partial |
| GP2.9 | complete evidence trail | Existing foundation, integration required |

## 4. Priority-agent acceptance matrix

| Agent | Minimum functional acceptance |
|---|---|
| Profiling Agent | Analyze dataset profile, identify suspicious columns/metrics, compare evidence, recommend deeper profiling and preserve evidence |
| Data Quality Agent | Derive/evaluate DQ concern, explain evidence, recommend rule/action, distinguish no-action cases, verify governed outcome |
| Governance Analyst | Answer cross-domain governance question with authoritative evidence, provenance, confidence and appropriate abstention |
| Data Steward | Propose glossary/classification/ownership/CDE governance changes with evidence and route to correct authority |

Each agent must additionally support:

- explicit project/resource scope
- bounded tools
- evidence references
- confidence
- negative/deny paths
- failure handling
- run history
- candidate learning emission where appropriate

## 5. PGCL implementation matrix

### Proactive Governed Case Learning

```text
Successful Supervised / Handsfree E2E run
→ significance filter
→ candidate learning case
→ DG Admin review
→ approve / edit / reject / defer / one-off
→ approved case memory
→ future retrieval
→ adapted reuse
→ outcome measurement
→ reinforce / revise / retire
```

| Capability | Status |
|---|---|
| Durable learning candidate | Implemented on main via #816 |
| Evidence-bound lifecycle | Implemented on main via #816 |
| Benchmark gate | Implemented on main via #819 |
| Success-run trigger | Verify / extend |
| Significance filter | Gap / verify |
| Duplicate clustering | Gap |
| DG Admin review UX | Gap |
| Approve with edits | Gap / verify |
| Reject / defer / one-off | Gap / verify |
| Approved case promotion | Partial / verify |
| Retrieval of approved cases | Partial / verify |
| Usage/outcome tracking | Gap / partial |
| Pattern consolidation | Gap |
| Positive + negative case support | Partial / verify |
| Cross-agent approved knowledge reuse | Gap / partial |

## 6. UI/UX functionality validation

For every principal screen/component validate:

- render
- authorized load
- unauthorized load
- loading state
- empty state
- partial-data state
- error state
- retry
- primary interaction
- validation errors
- submit/cancel
- navigation
- persisted state
- stale data refresh
- back/forward navigation where relevant

Priority components:

- source wizard
- dataset list
- Dataset 360 basic view
- profiling run
- profile progress
- metric/column explorer
- findings list/detail
- score view
- governance insight
- recommendation action
- approval UI
- DG Admin Handsfree action
- verification/closure
- learning candidate review

## 7. Development validation boundary

In scope:

- unit tests
- property/invariant tests for critical logic
- contract tests
- database/RLS tests needed for development correctness
- integration tests
- negative tests
- failure-case tests
- E2E functional tests
- UI component and browser functionality checks
- safe agent/adversarial development tests

Deferred:

- operational certification
- production hardening
- canary certification
- chaos certification
- production SLO release gates
- production revalidation
- operational supply-chain certification
- final release sign-off

## 8. Immediate execution order

1. verify exact current contracts for Dataset, ProfileRun, Finding, QualityScore, GovernanceInsight, AgentRun and LearningCandidate
2. close GP1.6 through GP1.10 backend gaps
3. build GP1.11 basic integrated UX
4. add GP1.12 UI functional tests
5. implement GP2.2 action classification and enforce no-data-remediation boundary
6. integrate stakeholder-approval and DG Admin Handsfree paths
7. complete priority-agent acceptance scenarios
8. complete PGCL Admin review flow and approved-case retrieval
9. reconcile all development-level tests
10. update this matrix from runtime evidence rather than planning assumptions

## 9. Completion rule

A row moves to complete only when implementation and its development-level validation are both present. Planning percentage alone cannot close an item.
