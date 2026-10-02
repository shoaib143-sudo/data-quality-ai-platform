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

## Administrative conclusion

Proceed with Jev as a governed semantic decision layer. Preserve DataNexus as System 0 authority, Jev as fast System 1 classification, and reasoning LLMs as System 2 investigation and generation.
