# Jev Decision Layer for DataNexus — Administrative Decision

Date: 2026-10-02  
Status: Recommended for phased implementation  
Repository baseline reviewed: `main`, latest observed commit `bf3b2b0fa0c412a66c55d71630a563c6c02d336a`

## Decision

DataNexus may integrate TypeSafe AI Jev as a replaceable, probabilistic semantic decision provider inside the existing Agent Runtime and AI Model Gateway.

Jev must not replace DataNexus authorization, RLS, resource ACLs, approval separation of duties, tool allowlists, runtime admission, execution budgets, data residency rules, kill switches, evidence truth, or human governance controls.

The governing model is:

```text
LLMs             = investigate, reason, explain, generate, plan
Jev              = classify, score, detect, route, verify
DataNexus policy = authorize, enforce, approve, deny, execute
Supabase         = authoritative state, evidence, audit
Learning Engine  = learn only from verified outcomes
```

## Why this is compatible with the current platform

The existing architecture already requires:

- deterministic server-side authority for execution;
- DENY precedence for resource ACLs;
- mutation-time authorization re-evaluation;
- independent tool governance;
- contract validation for tool/model inputs and outputs;
- Business + Governance approval for material production mutation;
- immutable execution-fingerprint approval binding;
- governed provider fallback;
- configurable runtime, token, cost and tool-call budgets;
- explicit agent version promotion;
- allow-listed multi-agent delegation;
- verified-outcome learning;
- separation of source-observed, inferred and human-confirmed evidence.

Jev therefore fits as a semantic signal provider without changing the authority model.

## Mandatory authority boundary

Jev output is probabilistic model evidence, not deterministic authority.

A Jev result may:

- classify risk;
- identify suspicious intent;
- score confidence;
- verify grounding;
- classify data;
- recommend a model route;
- identify retention or masking candidates;
- evaluate an agent trace.

A Jev result must not independently:

- grant a capability;
- override a DENY;
- approve a production mutation;
- bypass separation of duties;
- select a non-approved model/provider;
- relax data residency controls;
- mutate authoritative lineage;
- promote inferred knowledge to enterprise truth;
- bypass legal hold;
- authorize a tool or API endpoint.

## Recommended implementation abstraction

Introduce a replaceable decision contract rather than direct Jev calls across application code.

```text
DecisionGateway
  ├─ RulesDecisionProvider
  ├─ JevDecisionProvider
  ├─ LLMDecisionProvider
  └─ FutureLocalDecisionProvider
```

Each decision receipt should capture at minimum:

- provider and model/version;
- question schema/version;
- input/state fingerprint;
- typed decision;
- probability distribution;
- threshold used;
- policy version;
- execution/run ID;
- actor/resource scope;
- timestamp;
- downstream enforcement result.

## Initial priority

P0 first slice:

1. risky tool-call semantic screening;
2. prompt-injection and exfiltration detection;
3. RAG claim/citation grounding verification;
4. governed model-routing classification;
5. agent trace evaluation for completion, policy adherence and learning eligibility.

P1:

- PII/sensitivity classification;
- progressive skill disclosure;
- dynamic masking candidates;
- taxonomy/catalog classification;
- compliance checklist evaluation;
- retention classification;
- entity alignment;
- DPA gap classification.

Supplementary only:

- synthetic-data privacy validation;
- copyright/IP similarity risk;
- training-data poisoning detection.

These should augment specialist statistical, deterministic or retrieval controls rather than replace them.

## Runtime resilience requirement

Jev must be treated as a replaceable external provider.

Required behavior:

```text
Jev call
  -> timeout
  -> circuit breaker
  -> approved fallback or deterministic policy path
  -> fail closed where semantic evidence is mandatory
```

Authorization must not become dependent on Jev availability.

## Existing DataNexus capabilities considered in this recommendation

The recommendation was revalidated against:

- `PROJECT_STATE_v2.md`;
- Agent Policy v2;
- Agent Runtime & Execution Orchestration v2;
- AI Intelligence, Learning, Governance, Evaluation and Observability architecture;
- AI-assisted lineage truth boundary;
- current governed self-improvement and prospective evaluation work;
- current provider fallback and cancellation behavior;
- current execution-budget enforcement;
- current Data Governance maturity onboarding;
- current Job Monitor and governed execution model.

## Implementation rule

No direct Jev integration should be merged into an authorization-critical path until the DecisionProvider contract, fail-safe behavior, audit receipt format, thresholds and negative/failure-path tests exist.

## Mandatory pre-implementation additions

Before any Jev decision family is allowed to affect runtime behavior, DataNexus must implement the following additional controls.

### 1. Vendor and data-boundary due diligence

Verify and document:

- provider data retention and deletion behavior;
- whether customer payloads are used for model training;
- processing regions and data-residency options;
- subprocessors and contractual terms;
- DPA availability;
- relevant security attestations and incident-response commitments;
- API quotas, rate limits and operational SLA;
- acceptable handling of PII, secrets, source code, contracts and regulated data.

Until this review is complete, production-sensitive payloads must not be sent to Jev.

### 2. Decision payload minimization

Introduce a `DecisionPayloadBuilder` that constructs the smallest state necessary for each question.

The default must be to send fingerprints, derived metadata, classifications and bounded context rather than unrestricted raw records.

### 3. Cascading evaluation

Prefer:

```text
deterministic pre-check
  -> semantic ambiguity only
  -> Jev
  -> deeper reasoning or human review when uncertain
  -> deterministic DataNexus policy
```

This reduces cost, latency and unnecessary data exposure.

### 4. Governed question lifecycle

Jev questions are production behavior and must be treated as versioned governed artifacts.

Each decision definition must include:

- stable decision-family ID;
- question schema and version;
- accountable owner;
- provider/model constraints;
- threshold configuration;
- benchmark manifest;
- lifecycle state: DRAFT, SHADOW, ADVISORY, ACTIVE or RETIRED;
- promotion timestamp and approver;
- rollback target.

A material question change requires a new version and fresh shadow evaluation.

### 5. Calibration lifecycle

Thresholds must be versioned and recalibrated from verified DataNexus outcomes.

Calibration evidence must include false-allow rate, false-block rate, precision, recall, confidence calibration, human disagreement and outcome accuracy.

### 6. Decision-composition semantics

Where multiple Jev decisions are evaluated in parallel, DataNexus must define:

- veto precedence;
- dependency relationships;
- conflict handling;
- escalation rules;
- whether one high-risk decision can force a deterministic fail-closed path.

### 7. Provider and model version governance

Provider/model version changes must not silently change production behavior.

Where pinning is unavailable, a detected version change must trigger shadow evaluation before ACTIVE enforcement resumes.

### 8. Human override feedback

Persist:

- human override;
- override reason;
- original Jev decision;
- final policy result;
- verified downstream outcome.

Overrides feed evaluation and calibration. They must not directly retrain or promote production behavior.

### 9. Latency and backpressure controls

Every decision family must define a latency budget and synchronous/asynchronous execution mode.

High-volume workflows must support batching, concurrency limits, queueing, deduplication and admission controls.

### 10. Cache safety

Only cache semantic classification when bound to immutable:

- input fingerprint;
- question-schema version;
- provider/model identity;
- threshold version.

Authorization decisions must never be cached from Jev results.

### 11. Kill-switch granularity

Support disabling by:

- provider;
- decision family;
- organization/project;
- agent;
- environment.

### 12. Enforcement promotion criteria

SHADOW or ADVISORY decision families may move to ACTIVE only after meeting documented acceptance thresholds for:

- false-allow rate;
- false-block rate;
- calibration;
- latency;
- availability;
- cost;
- human override rate;
- regression results;
- negative/failure-path tests.

### 13. Decision quality ownership

Every decision family requires an accountable owner for question wording, thresholds, benchmarks and false-positive/false-negative tradeoffs.

### 14. Sensitive audit receipt handling

Decision receipts should store minimal metadata and fingerprints by default.

Sensitive payload snapshots should be stored only when required, in governed object storage with ACLs, encryption, retention and legal-hold controls.

### 15. Cross-tenant isolation

Explicitly test tenant and project isolation across:

- decision persistence;
- queues;
- caches;
- observability;
- R2 evidence references;
- retries and replay handling.

### 16. Jev cost governance

Add per-organization, project, agent and decision-family request/spend budgets. Jev itself must remain subject to DataNexus runtime cost governance.

### 17. Degraded-mode contract

Decision providers must expose explicit runtime state:

```text
AVAILABLE
DEGRADED
BYPASSED
UNAVAILABLE
FAIL_CLOSED
```

The product UI and Job Monitor should make degraded behavior visible.

### 18. Explainability boundary

Probability is not policy rationale.

Audit and UI views must separately display:

- semantic decision and confidence;
- deterministic policy result;
- policy reason;
- authority source.

### 19. DataNexus-specific benchmark corpus

Build the enforcement benchmark from representative DataNexus history, including sanitized examples of:

- safe and dangerous tool calls;
- approval-requiring actions;
- benign and injected documents;
- correct and incorrect citations;
- PII and sensitive-data cases;
- schema-drift cases;
- routing cases;
- successful, partial and failed agent runs.

## Decision Control Plane requirement

Add a dedicated Decision Control Plane to the AI Command Center.

It must expose at minimum:

- decision families and lifecycle state;
- provider/model/version;
- question-schema version;
- thresholds;
- false-allow and false-block rates;
- calibration;
- human override rate;
- latency;
- spend;
- fallback rate;
- provider health;
- last benchmark;
- promotion and rollback history.

## Revised foundation components

The implementation foundation is therefore:

```text
1. DecisionProvider
2. DecisionRegistry
3. DecisionPayloadBuilder
4. DecisionPolicy / threshold engine
5. DecisionReceipt
6. DecisionEvaluation service
7. Decision Control Plane
```

## Administrative conclusion

Proceed with Jev as a governed semantic decision layer. Preserve DataNexus as System 0 authority, Jev as fast System 1 classification, and reasoning LLMs as System 2 investigation and generation.

The additional controls above are mandatory parts of the implementation plan, not optional hardening work.
