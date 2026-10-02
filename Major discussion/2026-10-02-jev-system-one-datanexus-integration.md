# Jev / System One Decision Models in DataNexus

Date: 2026-10-02  
Status: Architecture discussion and implementation recommendation

## Context

Jev is a typed probabilistic decision model intended for fast classification, scoring and routing over unstructured state. The proposed DataNexus use cases span agent safety, data protection, governance intelligence, data intelligence and AI runtime observability.

The central question is whether these capabilities can be incorporated without weakening DataNexus's existing deterministic governance model.

## Double-confirmed recommendation

Yes. The fit is strong, provided Jev is integrated behind a replaceable `DecisionProvider` boundary and never becomes the final authorization authority.

The existing DataNexus architecture already separates:

```text
probabilistic reasoning
deterministic policy
authoritative evidence
human approval
verified learning
```

That separation should remain unchanged.

## Target architecture

```text
User / API / Agent
        |
        v
Identity + project/resource scope
        |
        v
Agent Runtime / Harness
        |
        +-------------------+--------------------+
        |                   |                    |
        v                   v                    v
Deterministic policy   DecisionGateway       Reasoning LLM
ACL / RLS / approval   Jev / rules           investigation
budgets / allowlists   classify / score      explanation
residency / lifecycle  detect / verify       planning
        |                   |                    |
        +-------------------+--------------------+
                            |
                            v
                    Governed execution
                            |
                            v
                    Verification + evidence
                            |
                            v
                       Learning Engine
```

## Use-case mapping

| # | Capability | Fit | Authority rule |
|---|---|---|---|
| 1 | Risky tool-call screening | Excellent | Jev signals risk, DataNexus authorizes |
| 2 | RAG source/citation verification | Excellent | Jev verifies claims, provenance stays authoritative |
| 3 | Memory purge/context compaction | Strong | Jev classifies, retention/legal hold remains deterministic |
| 4 | PII redaction gating | Excellent | Jev detects, masking/egress policy enforces |
| 5 | Catalog/taxonomy classification | Excellent | Jev suggests, governed promotion establishes truth |
| 6 | Compliance checklist evaluation | Excellent | Jev evaluates, controls/approvals remain authoritative |
| 7 | Progressive skill disclosure | Excellent | Jev classifies intent, capabilities/tool allowlists enforce |
| 8 | Entity alignment/MDM | Strong | Jev proposes match confidence, MDM process resolves |
| 9 | Cost/model routing | Excellent | Jev classifies route, approved-provider policy constrains |
| 10 | Audit decision validation | Strong | Jev supplies receipt, DataNexus provides durable audit |
| 11 | Prompt injection/exfiltration detection | Excellent | Jev screens, runtime blocks/quarantines |
| 12 | Cross-border transfer screening | Strong | Jev classifies content, residency policy decides |
| 13 | Entitlement-based masking | Excellent | Jev locates sensitive content, entitlements enforce |
| 14 | Data quality/schema drift | Excellent | Jev adds semantic drift signal, DQ engine remains authoritative |
| 15 | Synthetic-data privacy validation | Supplementary | Use alongside statistical privacy tests |
| 16 | IP/copyright cleanroom validation | Supplementary | Use alongside dedicated similarity/retrieval controls |
| 17 | Retention/expiry classification | Excellent | Jev classifies, legal hold/retention policy decides |
| 18 | Training-data poisoning defense | Supplementary | Combine with provenance/statistical anomaly controls |
| 19 | Semantic API authorization | Excellent with constraint | Jev may classify intent/risk, never grant authority |
| 20 | DPA compliance mapping | Excellent | Jev maps clauses, legal/governance review remains final |

## Five implementation workstreams

### A. Agent Safety Gate
Covers tool-call risk, prompt injection, semantic API risk and progressive skill disclosure.

### B. Data Protection Gate
Covers PII, masking, cross-border transfer classification, memory/retention and legal-hold-aware lifecycle support.

### C. Governance Intelligence
Covers taxonomy classification, control/checklist evaluation and DPA mapping.

### D. Data Intelligence
Covers MDM matching, semantic schema drift, synthetic privacy signals, poisoning indicators and IP-risk signals.

### E. AI Runtime Intelligence
Covers RAG grounding, model routing, audit receipts and agent trace evaluation.

## Best first production slice

The first implementation should be deliberately narrow:

1. Tool-call semantic risk gate.
2. Prompt injection/exfiltration gate.
3. RAG grounding verifier.
4. Model-routing classifier.
5. Agent trace evaluator.

These reuse current Runtime v2, AI Model Gateway, evidence and learning primitives while adding limited new authority surface.

## Alignment with existing DataNexus decisions

### Agent Policy v2

No change to:

- DENY precedence;
- execution capability requirements;
- Business + Governance dual approval;
- same-person dual-axis rejection;
- mandatory approval comments;
- execution fingerprint binding;
- mutation-time reauthorization.

### Runtime v2

Jev plugs into existing:

- tool input/output validation;
- governed tool execution;
- runtime observability;
- model/provider routing;
- cost/token accounting;
- admission and execution budgets;
- failure classification.

### AI Intelligence architecture

The existing provider-based design explicitly avoids hardwiring one model. Jev should follow the same rule through a `DecisionProvider` interface.

### Lineage truth boundary

Jev-generated lineage, classification or relationship judgments must preserve the current evidence boundary:

```text
source-observed != AI-inferred != human-confirmed inferred
```

No confidence score converts inferred evidence into source-observed truth.

### Governed learning

Jev can evaluate traces and produce learning signals, but only verified outcomes may enter promoted procedural or enterprise learning.

## Required decision receipt

A normalized decision record should include:

```text
decision_provider
model_id
model_version
question_schema_id
question_schema_version
state_fingerprint
decision_type
decision_value
probabilities
confidence
threshold
policy_version
resource_scope
actor_id
run_id
tool_call_id
created_at
enforcement_result
```

The receipt is evidence, not authorization.

## Failure and security cases that must be tested

- Jev timeout;
- malformed Jev response;
- probability below threshold;
- contradictory parallel decisions;
- stale decision receipt;
- provider/model version change;
- replayed decision receipt;
- input fingerprint mismatch;
- prompt-injected decision state;
- Jev says allow while deterministic ACL says deny;
- Jev says low risk while production mutation requires approval;
- approved model route violates residency;
- missing audit persistence;
- decision-provider outage during a critical action.

Expected invariant:

```text
probabilistic output can never widen deterministic authority
```

## Gap closure and optimized decision architecture

The implementation plan must additionally close the following gaps before enforcement.

### Vendor and data-boundary assessment

Jev is an external provider and therefore requires an explicit enterprise data-processing review before sensitive production payloads are sent.

The review must cover retention, deletion, training use, region, subprocessors, DPA, security attestations, incident handling, quotas and SLA.

### Data minimization

A `DecisionPayloadBuilder` should transform raw runtime state into the minimum state required by the decision family.

Raw production data should never be sent simply because it is available.

### Cascading decision pipeline

The preferred execution pattern is:

```text
Request
   |
   v
Deterministic pre-check
   |
   +--> obvious deterministic outcome
   |
   +--> semantic ambiguity
             |
             v
           Jev
             |
        +----+----+
        |         |
    confident   uncertain
        |         |
        |         v
        |    deeper reasoning
        |    or human review
        +---------+
             |
             v
      deterministic
      DataNexus policy
```

Jev is used where semantic judgment adds value, not as a replacement for cheap and exact rules.

### Governed DecisionDefinition lifecycle

Treat question wording as production configuration.

```text
DecisionDefinition
  decision_family
  question_schema
  version
  owner
  provider_constraints
  thresholds
  benchmark_manifest
  status: DRAFT | SHADOW | ADVISORY | ACTIVE | RETIRED
  promoted_at
  rollback_target
```

A material wording or schema change creates a new version and returns to SHADOW.

### Calibration and enforcement promotion

Every ACTIVE family needs measured acceptance criteria.

Track:

- precision and recall;
- false-allow rate;
- false-block rate;
- calibration;
- human override rate;
- verified outcome agreement;
- latency;
- cost;
- availability.

No semantic decision family becomes enforcement-relevant solely because an API integration works.

### Parallel decision composition

When multiple questions are evaluated together, DataNexus must define:

- veto rules;
- precedence;
- dependency ordering;
- conflict resolution;
- escalation behavior.

A high-risk semantic result may force a conservative path but can never grant additional authority.

### Model and provider drift

Provider/model changes require version evidence and shadow re-evaluation before enforcement if behavior may change.

### Human disagreement as evaluation evidence

Store original decision, human override, override reason, final policy result and verified outcome.

This evidence feeds calibration and evaluation only. It does not automatically modify production decision logic.

### Performance and backpressure

Each decision family must define:

- synchronous or asynchronous execution;
- latency SLO;
- timeout;
- concurrency limit;
- batching eligibility;
- queue behavior;
- deduplication behavior.

### Safe caching

Cache only semantic decisions bound to immutable content and configuration fingerprints.

Never treat a cached Jev result as cached authorization.

### Cost governance

Jev usage should consume the same DataNexus budget model as other AI/runtime providers, with request and spend ceilings by organization, project, agent and decision family.

### Cross-tenant isolation

Decision storage, queues, caches, observability and object-store references must retain current DataNexus organization/project isolation.

### Sensitive evidence handling

Store minimal decision receipts in Supabase. Store raw sensitive evidence only when justified, preferably in governed R2 with encryption, ACL, retention and legal-hold controls.

### Degraded states

Expose:

```text
AVAILABLE
DEGRADED
BYPASSED
UNAVAILABLE
FAIL_CLOSED
```

The runtime and UI must make provider degradation explicit.

### Explainability separation

Display semantic and authoritative results separately:

```text
semantic_decision
semantic_confidence

policy_result
policy_reason
authority_source
```

This prevents a probability from being interpreted as regulatory or authorization rationale.

## Decision Control Plane

Add a new Decision Control Plane inside the AI Command Center.

It should provide:

- decision-family inventory;
- lifecycle state;
- provider/model/version;
- question-schema version;
- threshold version;
- false-allow and false-block rates;
- calibration;
- human override rate;
- latency;
- spend;
- fallback rate;
- provider health;
- latest benchmark;
- promotion and rollback history.

## Revised foundation components

The core foundation becomes:

```text
DecisionProvider
DecisionRegistry
DecisionPayloadBuilder
DecisionPolicy / threshold engine
DecisionReceipt
DecisionEvaluation service
Decision Control Plane
```

## DataNexus-specific benchmark corpus

Before enforcement, create a representative sanitized benchmark from DataNexus evidence covering:

- safe and dangerous tool calls;
- actions requiring approval;
- benign and injected documents;
- supported, contradicted and unsupported RAG claims;
- PII and sensitive-data cases;
- structural and semantic drift;
- model-routing cases;
- successful, partial and failed agent executions.

This corpus is the promotion gate for Jev question schemas and model/provider revisions.

## Optimized promotion sequence

```text
DRAFT
  |
  v
SHADOW
  |
  +--> benchmark insufficient -> remain SHADOW
  |
  v
ADVISORY
  |
  +--> human disagreement / SLO failure -> rollback
  |
  v
ACTIVE
  |
  +--> drift / provider change / regression -> SHADOW or RETIRED
  |
  v
RETIRED
```

## Product positioning

The resulting layered model is:

```text
System 2: reasoning LLMs
  investigate / plan / explain / generate

System 1: Jev or equivalent decision providers
  classify / score / detect / route / verify

System 0: DataNexus governance
  authorize / enforce / approve / deny / execute
```

This layered architecture is preferable to embedding Jev calls directly in agents or replacing existing policy engines.

## Conclusion

The recommendation remains to implement Jev, but as a replaceable governed semantic decision provider. The gap-closure controls, question governance, calibration lifecycle, Decision Control Plane and data-boundary assessment are required components of the implementation, not optional hardening work.
