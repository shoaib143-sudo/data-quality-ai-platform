# Agent Self-Improvement and Learning Operations Runbook

Date: 2026-09-29
Status: Implementation baseline
Owner: Data Governance Admin

## Purpose

This runbook defines the operational implementation baseline for governed agent self-improvement across DataNexus. It covers learning evidence capture, candidate creation, approval, evaluation, promotion, shadow execution, rollback, and Command Center observability.

## Operating principles

1. Agents do not rewrite themselves directly.
2. A successful execution creates evidence, not automatic learning.
3. Candidate learning must be bounded by use case, agent family, policy version, and authorization scope.
4. Authorization, destructive-action policy, secrets, and privilege boundaries cannot be changed by learning.
5. Promotion requires evaluation evidence and an auditable lifecycle transition.
6. Learning changes are versioned and reversible.
7. Negative cases, failed runs, rejected recommendations, recoveries, and human corrections are first-class learning evidence.
8. Low-evidence or conflicting candidates fail closed.

## Learning lifecycle

Observed -> Candidate -> Validated -> Approved -> Shadow -> Active -> Deprecated -> Rolled Back

Each transition must retain:
- agent and agent version
- learning case and version
- evidence references
- evaluation run
- policy version
- actor/approver
- timestamp
- rollback target

## Admin confirmation workflow

For successful supervised and handsfree runs:

Successful verified run -> learning candidate -> Data Governance Admin review -> one of:
- Mark as positive
- Mark as negative
- Not reusable
- Needs more examples
- Apply only to this use case
- Apply to agent family
- Add commentary

Admin confirmation must not bypass evaluation or authorization controls.

## Required operational entities

- learning_case
- learning_case_evidence
- learning_candidate
- learning_feedback
- learning_evaluation_run
- learning_promotion
- agent_learning_assignment
- learning_policy

## Minimum evidence captured per execution

- agent ID and version
- use case
- execution mode
- task/input class
- tools invoked
- policy decisions
- output/result
- verification result
- success/failure category
- latency
- token/cost usage
- approval history
- recovery events
- artifact references
- evidence references
- admin/user feedback
- final disposition

## Promotion gates

Critical gates are fail closed:
- no authorization regression
- no policy violation regression
- no destructive-action boundary regression
- no privileged-tool expansion
- negative-case suite passes
- deterministic assertions pass
- baseline versus candidate comparison does not regress protected metrics
- provenance complete
- rollback target available

## Initial authority levels

Level 0: Observe only
Level 1: Recommend learning
Level 2: Governed learning with evaluation and shadow mode
Level 3: Bounded auto-promotion

Initial DataNexus activation target is Levels 0 to 2. Level 3 remains architecturally supported but disabled.

## Risk-sensitive defaults

Thresholds must be configuration, not hard-coded policy.

Suggested starting defaults:
- Informational: 3 evidence items, 10 shadow runs
- Recommendation: 5 evidence items, admin approval, 20 shadow runs
- Governance decision support: 10 evidence items, admin approval, 30 shadow runs
- Governed execution: 20 evidence items, mandatory approval, 50 shadow runs
- Destructive or privileged actions: no auto-learning and manual-only promotion

## Command Center operations

Command Center must expose:
- active learning cases
- pending candidates
- promoted/rejected cases
- regressions
- rollbacks
- evaluation pass rate
- confidence trend
- learning contribution by agent
- version and learning pack per agent
- evidence trace
- shadow disagreement rate
- latency/token/cost impact
- policy violations

## Failure handling

Explicit negative and failure-path tests:
- contradictory positive cases
- poisoned or unauthorized feedback
- duplicate candidates
- stale evidence
- low-evidence promotion
- evaluation timeout
- judge disagreement
- approval revoked
- rollback
- agent-version mismatch
- policy-version mismatch
- tool schema changed
- source data changed
- privilege boundary changed

## Security constraints

- no learning from unauthenticated feedback
- no direct prompt mutation from user text
- no secret material in learning cases
- learning cannot elevate tool permissions
- learning cannot override authorization policy
- denied actions cannot become allowed through learning
- destructive execution policy remains outside self-learning
- every case and promotion requires provenance

## Implementation workstreams

WS1: Learning data model, evidence contracts, migrations
WS2: Candidate engine, positive/negative case registry, deduplication
WS3: Evaluation framework, benchmark sets, baseline/candidate comparison
WS4: Promotion, versioning, shadow mode, rollback governance
WS5: Command Center learning observability

## Definition of Done

- all 8 agents emit governed learning evidence
- positive and negative cases supported
- successful supervised/handsfree runs can create admin-review candidates
- candidates cannot directly alter production behavior
- baseline/candidate evaluation exists
- failure and adversarial datasets exist
- promotions are versioned and reversible
- authorization cannot be modified by learning
- Command Center exposes evidence, state, regressions, cost/token impact
- essential unit, integration, negative, and failure-path tests pass
- exact-head CI is green
- no production behavior change occurs without governed promotion
