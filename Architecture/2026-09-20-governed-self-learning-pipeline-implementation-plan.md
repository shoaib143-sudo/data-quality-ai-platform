# DataNexus Governed Self Learning Pipeline Implementation Plan

**Date:** 2026-09-20  
**Status:** Implementation plan based on current protected main  
**Baseline:** `56426913d9849dab1d3e1af1bf5e00ad88b07595`

## Purpose

This plan defines the implementation path for the DataNexus Self Learning capability.

The capability is not a ninth unrestricted autonomous agent. It is a cross-cutting governed learning pipeline used by the eight canonical domain agents. It converts verified outcomes and measured evaluation evidence into reviewable improvement candidates, benchmarks them independently, and allows controlled release only through explicit governance.

The target loop is:

```text
Execute
→ Observe
→ Evaluate
→ Verify Outcome
→ Build Learning Evidence
→ Identify Gap
→ Propose Improvement
→ Offline Benchmark
→ Adversarial Regression
→ Human Governance Review
→ Controlled Release
→ Revalidate
→ Rollback if required
→ Future Use
```

No step in this pipeline grants new execution authority by itself.

## Relationship to accepted architecture

This plan continues existing accepted DataNexus architecture rather than introducing a parallel learning system.

Primary existing decisions:

1. ADR-006 separates reasoning from learning and requires learning from verified outcomes rather than recursively trusting prior AI output.
2. Candidate learning remains distinct from authoritative enterprise knowledge.
3. Memory is contextual evidence and cannot authorize actions.
4. Current authorization and current policy evaluation remain mandatory for every future action.
5. Automatic retraining, automatic production promotion, and automatic authority expansion are disabled.
6. Learning candidates must be independently evaluated and human governed before controlled production release.
7. Rollback remains mandatory for any promoted runtime change.

## Existing implementation baseline

The repository already contains major parts of the Phase 11 substrate.

| Capability | Current implementation |
| --- | --- |
| Verified episodic learning | `agent.agent_learning_cases` and governed memory provider |
| Governed action outcome authority | `governance.governed_action_outcomes` |
| Verified outcome promotion | `governance.promote_verified_governed_action_outcome(...)` |
| Agent memory | working memory, durable memories, verified episodic retrieval |
| Learning context | `lib/agents/governed-learning-context.ts` |
| Learning enrichment | `lib/agents/agent-memory-learning.ts` |
| Evaluation ledger | `governance.ai_evaluation_results` |
| Agent skill evaluation | `lib/agents/agent-skill-evaluation.ts` |
| Structural outcome evaluation | `lib/agents/agent-skill-outcome-evaluator.ts` |
| Improvement proposal generation | `lib/agents/governed-skill-improvement-proposals.ts` |
| Promotion gate | `lib/agents/governed-skill-promotion-gate.ts` |
| Continuous model learning governance | `lib/ai/continuous-learning-governance.ts` |
| Learning governance CI | `.github/workflows/continuous-learning-governance.yml` |
| Governed outcome learning CI | `.github/workflows/v5-governed-outcome-learning.yml` |
| Rollback contracts | native rollback contract and verification workflow |

Important merged milestones include PRs #128, #133, #204, #210, #482, #483, #485, and #486.

## Current gap

The existing components are strong but not yet one canonical end-to-end Phase 11 pipeline.

The main missing capability is orchestration and durable lifecycle state across:

```text
evaluation evidence
→ improvement proposal
→ learning candidate
→ benchmark
→ review
→ controlled release
→ production verification
→ rollback or retain
```

Current code can evaluate skills, propose improvements, and evaluate a promotion gate, but the complete lifecycle is not yet represented as one durable governed state machine with a single evidence chain.

A second gap is scope convergence. Model-change governance, skill-change governance, verified outcome learning, and memory retrieval are implemented as related controls, but their shared lifecycle and authority boundaries are not yet expressed through one canonical learning candidate contract.

A third gap is portfolio truth. Existing agent classification deliberately rejects unsupported current `LEARNING`, `ONLINE_LEARNING`, and `FULL_AUTONOMY` claims. That classification should remain unchanged until the governed pipeline is implemented and production evidence proves the target state.

## Target architecture

The Self Learning capability should use a two-layer model.

### Layer 1: Learning evidence

Learning evidence is immutable or append-only evidence derived from:

- verified governed action outcomes;
- agent skill evaluations;
- deterministic verification;
- labeled datasets;
- adversarial evaluation;
- human evaluation;
- measured latency and cost;
- accepted and rejected recommendations;
- rollback outcomes;
- verified negative outcomes;
- drift observations.

Learning evidence is not an executable instruction.

### Layer 2: Learning candidate

A learning candidate is a governed proposal derived from evidence.

Candidate types should initially be:

| Candidate type | Example |
| --- | --- |
| SKILL_CONTRACT | output fields, evidence requirements, handoff rules |
| TOOL_SELECTION_POLICY | improve selection among already-authorized tools |
| PROMPT_OR_REASONING_CONFIG | bounded configuration change |
| RETRIEVAL_POLICY | ranking, filtering, evidence composition |
| MODEL_ROUTING | provider/model routing candidate |
| CONFIDENCE_POLICY | calibration or evidence-strength policy |
| RESOURCE_POLICY | latency, cost, iteration efficiency |
| PROCEDURAL_PATTERN | verified successful workflow pattern |

Authority expansion must not be a learning candidate type. New tools, new mutation rights, broader project scope, weaker approvals, and destructive permissions remain separate explicit product/security changes.

## Canonical learning candidate lifecycle

```text
PROPOSED
→ EVIDENCE_READY
→ BENCHMARKING
→ NOT_READY | REVIEW_REQUIRED
→ APPROVED_FOR_CONTROLLED_RELEASE | REJECTED
→ CANARY
→ VERIFIED
→ ACTIVE
→ ROLLED_BACK | SUPERSEDED | RETIRED
```

Required state rules:

- an agent may propose but cannot approve its own candidate;
- candidate creation does not modify the live skill registry;
- benchmark evaluator must be independent of the proposing agent;
- failed authority or adversarial checks make the candidate NOT_READY;
- human review cannot bypass missing mandatory evidence;
- release must re-check current authorization and policy;
- production verification is required before ACTIVE;
- rollback must remain available after release;
- historical evidence is append-only and must not be rewritten to manufacture success.

## Parallel implementation workstreams

### Workstream A: Canonical learning candidate contract and ledger

Objective: create the durable Phase 11 state machine.

Implementation:

- define versioned learning candidate schema;
- persist candidate source agent, source skill, candidate type, proposed delta, baseline version, target version, policy version, evidence cutoff, evidence references and lifecycle state;
- add append-only candidate transition evidence;
- add idempotency key and project boundary;
- enforce service-side mutation authority;
- prevent direct authenticated state transitions;
- record audit evidence for every transition.

Primary outputs:

- migration for canonical learning candidate tables;
- typed application contract;
- repository verifier;
- SQL project/RLS/privilege tests.

### Workstream B: Evidence assembler and candidate builder

Objective: convert existing verified evidence into deterministic candidates.

Implementation:

- consume agent skill scorecards;
- consume verified governed action outcomes;
- consume existing learning cases only when canonical provenance is valid;
- preserve positive and negative outcomes;
- enforce evidence cutoffs to prevent temporal leakage;
- exclude synthetic/bootstrap evidence from production learning;
- map failing evaluation dimensions into governed proposal categories;
- deduplicate repeated candidate proposals;
- attach source evidence without copying hidden reasoning.

Primary outputs:

- candidate builder service;
- evidence assembler;
- deterministic normal and negative tests.

### Workstream C: Offline benchmark and regression certification

Objective: determine whether a candidate is actually better than the active baseline.

Implementation:

- benchmark candidate and baseline on the same versioned dataset;
- require minimum case count and minimum score;
- require no authority violations;
- require no adversarial failures;
- test positive, negative, boundary and failure cases;
- include cost and latency when measured;
- produce immutable benchmark evidence;
- fail closed when evaluator evidence is incomplete.

Primary outputs:

- benchmark runner;
- benchmark receipt schema;
- adversarial regression suite;
- exact reproducibility reference.

### Workstream D: Human review, controlled release and rollback

Objective: connect eligibility to governed deployment without self-promotion.

Implementation:

- add governed review boundary;
- require independent reviewer evidence;
- re-check current policy and authorization at release;
- create controlled release manifest;
- support canary or bounded project release;
- verify exact candidate version after release;
- record before and after evidence;
- trigger rollback on failed acceptance;
- persist release and rollback evidence.

Primary outputs:

- review service;
- controlled release contract;
- rollback binding;
- production verification gate.

### Workstream E: Agent integration across the eight canonical agents

Objective: make the learning pipeline reusable without duplicating implementation.

Implementation:

- add a common learning adapter to the canonical agent runtime;
- use each agent excellence contract to determine eligible evaluation dimensions;
- read prior verified learning only through governed memory/context providers;
- record learning influence evidence;
- prohibit reuse of prior recommendation prose as truth;
- allow agents to propose improvement candidates but never self-apply them;
- keep current action authorization independent from learning context.

Primary outputs:

- shared runtime adapter;
- per-agent conformance tests;
- portfolio classification evidence.

### Workstream F: Command Center, observability and assurance

Objective: make learning visible, auditable and governable.

Implementation:

- expose learning candidate lifecycle in the AI Command Center;
- show evidence, benchmark comparison, reviewer decision, release state and rollback readiness;
- expose no hidden chain-of-thought;
- correlate candidate, evaluation, run, tool, outcome and release evidence;
- add learning SLOs and failure telemetry;
- add independent adversarial certification;
- add golden end-to-end scenario coverage.

Primary outputs:

- learning governance UI;
- trace correlation;
- operational metrics;
- independent assurance workflow.

## Dependency graph

```text
A Candidate Contract
├── B Evidence Builder
├── C Benchmark
└── D Review and Release

B + C
└── E Agent Integration

A + B + C + D + E
└── F Command Center and Production Assurance
```

Workstreams A, B and C can start in parallel provided A owns the canonical contract and B/C use that contract without redefining it.

Workstream D can begin against typed interfaces while A is being implemented.

Workstream E can add read-only adapters in parallel but must not activate a learning classification before A through D are certified.

## Proposed persistence model

Prefer extending the existing `agent` and `governance` authority model rather than creating a separate learning schema.

Initial durable entities:

### `agent.learning_candidates`

Recommended fields:

- id;
- project_id;
- candidate_key;
- candidate_type;
- agent_key;
- skill_key;
- source_agent_run_id;
- baseline_version;
- candidate_version;
- proposed_change;
- evidence_cutoff_at;
- status;
- created_at.

### `agent.learning_candidate_evidence`

Recommended fields:

- candidate_id;
- evidence_ref;
- evidence_type;
- observed_at;
- available_at;
- source_record_type;
- source_record_id;
- synthetic;
- persisted.

### `agent.learning_candidate_transitions`

Append-only lifecycle ledger.

### `agent.learning_candidate_benchmarks`

Stores independent baseline versus candidate benchmark receipts.

### `agent.learning_candidate_reviews`

Stores human governance review evidence.

### `agent.learning_releases`

Stores controlled release, canary, production verification and rollback references.

Final table names should be checked against the live schema immediately before migration creation.

## Reuse rules

Do not build new parallel versions of:

- agent memory;
- evaluation engine;
- governed action outcome authority;
- learning case storage;
- policy engine;
- approval framework;
- skill registry;
- autonomy runtime;
- rollback runtime;
- audit ledger.

Phase 11 should orchestrate those existing authorities.

## Safety invariants

The implementation is unacceptable if any of these become false:

1. Memory never grants action authority.
2. Learning never expands tool authority automatically.
3. Learning never expands mutation scope automatically.
4. An agent cannot approve its own improvement.
5. A candidate cannot self-promote to production.
6. Synthetic/bootstrap evidence cannot qualify production learning.
7. Missing evidence cannot become PASS.
8. Human override cannot bypass mandatory evidence.
9. Candidate release must re-check current authorization and policy.
10. Production promotion requires rollback readiness.
11. A failed canary or regression test cannot be represented as ACTIVE.
12. Cross-project evidence cannot influence another project.
13. Hidden chain-of-thought is never persisted as learning evidence.
14. Historical evidence is not rewritten after outcome verification.
15. Every future governed action requires fresh current authorization.

## Acceptance matrix

| Gate | Required result |
| --- | --- |
| Candidate generation | Deterministic from persisted evidence |
| Project isolation | Cross-project candidate/evidence access denied |
| Outcome evidence | VERIFIED and provenance complete |
| Synthetic evidence | Rejected for production learning |
| Negative outcomes | Preserved and evaluated |
| Temporal cutoff | No future evidence leakage |
| Benchmark | Candidate compared to active baseline |
| Regression | No required dimension regression |
| Authority | Zero authority violations |
| Adversarial suite | Zero mandatory failures |
| Human review | Required before controlled release |
| Release authorization | Revalidated at release time |
| Canary | Bounded and evidence backed |
| Production activation | Exact candidate/version verified |
| Rollback | Proven and evidence backed |
| Audit | Full candidate lifecycle traceable |

## Golden scenario

The first production-proof learning journey should be:

```text
Data Quality Agent
→ detects issue
→ recommends governed remediation
→ action is approved and executed
→ independent verification records EFFECTIVE or INEFFECTIVE
→ governed outcome is promoted to verified episodic learning
→ skill evaluation detects a measurable gap
→ learning candidate is created
→ candidate is benchmarked offline
→ adversarial regression passes
→ human governance review approves controlled release
→ bounded canary runs
→ production verification passes
→ candidate becomes ACTIVE
→ later agent run uses the verified learning context
→ current action is still independently authorized
```

The negative version of the same scenario must prove that ineffective, synthetic, stale, cross-project, unverified, or policy-invalid evidence cannot drive promotion.

## Completion gate

Phase 11 is complete only when:

- all eight agents can emit governed evaluation evidence through the shared contract;
- verified outcomes can become learning evidence without becoming authority;
- failed evaluation dimensions can deterministically produce durable learning candidates;
- every candidate has a complete provenance chain;
- candidate versus baseline benchmarking is reproducible;
- regression and adversarial tests can veto promotion;
- human review is mandatory where defined;
- no agent can self-promote;
- controlled release and rollback are operational;
- production use records learning influence evidence;
- current authorization remains independent from learning;
- exact-head CI and production revalidation pass;
- agent portfolio classification can be updated from current non-learning claims only when the measured runtime evidence supports it.

## First implementation increment

The first increment should implement Workstream A plus the minimum Workstream B integration:

1. canonical `LearningCandidate` TypeScript contract;
2. durable candidate and lifecycle ledger migration;
3. deterministic candidate creation from existing agent skill evaluation scorecards;
4. explicit no-self-promotion and no-authority-expansion constraints;
5. project/RLS/privilege enforcement;
6. normal, negative, cross-project and idempotency tests;
7. dedicated CI verifier.

This gives the rest of Phase 11 one authoritative backbone and avoids adding more disconnected learning components.
