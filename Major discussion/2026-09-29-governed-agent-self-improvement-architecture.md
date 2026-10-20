# Governed Agent Self-Improvement Architecture and Implementation Decision

Date: 2026-09-29
Decision status: Approved implementation direction

## Decision

DataNexus will implement agent self-improvement as a governed, evidence-driven learning system. Agents will not freely self-modify. They will capture execution evidence, derive bounded candidate learning, evaluate it against controlled benchmarks, and promote only versioned changes that pass governance gates.

## Rationale

A self-improving agent platform must distinguish between observing outcomes, proposing learning, validating learning, approving learning, and activating learning. Collapsing these steps would make successful execution indistinguishable from safe reusable knowledge. The selected model preserves human oversight, auditability, rollback, authorization boundaries, and deterministic controls while still allowing agents to improve over time.

## Architectural flow

Execution -> Evidence -> Candidate -> Evaluation -> Approval -> Shadow -> Active -> Monitor -> Rollback/Deprecate

### Evidence layer

Every execution produces a normalized learning event rather than relying on raw conversation transcripts as the source of truth.

### Case registry

Learning is represented as governed positive, negative, neutral, and non-reusable cases with explicit applicability boundaries, confidence, evidence count, version, and lifecycle state.

### Candidate engine

Candidates can originate from verified successful runs, failed executions, retries and recoveries, rejected recommendations, approval denials, human corrections, negative tests, policy violations, and tool failures. Similar evidence should be clustered to reduce noisy one-event learning.

### Evaluation

Each candidate is compared with the current baseline using deterministic assertions, reference-based evaluation, model/judge evaluation for qualitative dimensions, and human/domain-expert review where required. Security, authorization, destructive actions, and privilege boundaries must never depend only on a model judge.

### Promotion

Promotion lifecycle:

Observed -> Candidate -> Validated -> Approved -> Shadow -> Active -> Deprecated -> Rolled Back

Agent learning is versioned separately from agent code, for example:

Agent v3.2 + Learning Pack 14

### Shadow mode

A candidate learning pack first predicts what it would do while the live behavior remains unchanged. Shadow disagreement and regression evidence are collected before activation.

## Governance authority levels

Level 0: Observe only
Level 1: Recommend learning
Level 2: Governed learning with evaluation and shadow
Level 3: Bounded auto-promotion

Initial implementation enables Levels 0 to 2. Level 3 remains disabled.

## Five parallel implementation workstreams

| Workstream | Scope |
| --- | --- |
| WS1 | Learning schema, evidence contracts, migrations |
| WS2 | Candidate engine, positive/negative registry, deduplication |
| WS3 | Evaluation framework, benchmark datasets, baseline/candidate comparison |
| WS4 | Promotion, versioning, shadow mode, rollback |
| WS5 | Command Center learning observability |

## Required Command Center views

1. Learning Overview
2. Agent Learning Detail
3. Candidate Review
4. Learning Trace
5. Regression Monitor

Key measures include candidate creation and acceptance rate, positive/negative conversion, evaluation pass rate, regressions, rollbacks, task success change, latency/token/cost impact, policy violations, manual-review volume, false-positive candidates, and shadow disagreement rate.

## Learning-policy boundaries

Learning must never grant new authorization, bypass approval, weaken destructive-action protections, expose secrets, expand a tool permission boundary, convert a denied action to allowed, silently mutate a live agent, or promote without provenance.

## Phased implementation

Phase 1: Foundation
- contracts
- schema
- execution instrumentation
- evidence IDs
- case registry

Phase 2: Candidate learning
- candidate generation
- admin positive/negative confirmation
- grouping/deduplication
- confidence/evidence calculation

Phase 3: Evaluation
- benchmark datasets
- baseline/candidate comparison
- automatic fail-closed gates
- negative/failure suites

Phase 4: Governance
- lifecycle state machine
- approval
- versioning
- shadow mode
- rollback

Phase 5: Command Center
- overview
- candidate review
- evidence trace
- agent detail
- regression monitoring

Phase 6: Agent integration
- all 8 agents
- PGCL-compatible interfaces
- supervised
- handsfree
- recovery
- adversarial/failure tests

Phase 7: Controlled activation
- observe
- generate candidates
- request admin confirmation
- shadow evaluate
- activate governed learning after evidence

## Completion criteria

Implementation is complete when all 8 agents produce governed learning evidence, candidate learning is isolated from production behavior, positive and negative cases are supported, promotions are versioned and reversible, authorization cannot be modified through learning, Command Center exposes evidence and regression state, and essential unit/integration/negative/failure tests pass on an exact validated head.

## Implementation note

The implementation should reuse existing DataNexus governance, agent runtime, evidence, approval, audit, cost/token, and Command Center capabilities where possible. Existing contracts should be extended rather than duplicated.
