# Jev Decision Layer v1 — Post-Implementation Assurance Plan

Date: 2026-10-03
Implementation PR: #1112
Status: Implementation complete; exact-head repository validation and external-provider activation remain gated.

## Objective

Validate that the Jev Decision Layer adds semantic classification capability without weakening DataNexus deterministic governance, authorization, evidence truth, tenant isolation, cost controls, or existing runtime behavior.

## 1. Re-validation

Required before merge:

- fast-path Decision Layer tests;
- TypeScript compilation;
- application build;
- ADR-006 AI provider contract checks;
- Native Supervisor Production and durable-resume checks;
- Native Trajectory Evaluation;
- AI Production Boundaries;
- Autonomous Agent Governance;
- Navigation Integrity;
- P0-P5 revalidation;
- CodeQL and dependency audit;
- Production Security Posture;
- Repository Governance;
- Post Implementation Assurance workflow.

The merge candidate must be rebased or reconciled to the current protected `main` and must be zero commits behind before final exact-head validation.

## 2. Independent adversarial audit

Review the implementation assuming Jev is compromised, unavailable, wrong, manipulated, or maliciously prompted.

The audit must verify:

1. Jev cannot grant a DataNexus capability.
2. Jev cannot override ACL/RLS DENY.
3. Jev cannot satisfy Business or Governance approval.
4. Jev cannot bypass separation of duties.
5. Jev cannot widen a tool allowlist.
6. Jev cannot select an unapproved provider or model.
7. Jev cannot promote inferred evidence into authoritative truth.
8. A replayed decision receipt cannot authorize execution.
9. A state-fingerprint mismatch cannot reuse a semantic decision.
10. Provider failure in SHADOW cannot change deterministic execution or routing results.
11. Prompt injection inside decision state cannot modify question registry or authority rules.
12. Cross-tenant decision telemetry, cache, or evidence reuse is impossible.
13. Sensitive input is minimized and common embedded credentials are redacted before provider egress.
14. A provider/model version change cannot silently become ACTIVE enforcement.

## 3. Unit and contract tests

Minimum coverage:

- Noul response parsing;
- Choice response parsing;
- Score response parsing;
- invalid probability rejection;
- missing required answers;
- malformed usage data;
- provider HTTP failure;
- timeout and abort behavior;
- per-family timeout forwarding;
- stable state fingerprint;
- payload depth, key, array and string bounds;
- structured secret-key removal;
- free-text bearer/JWT/API-key/private-key redaction;
- lifecycle enforcement eligibility;
- confidence threshold behavior;
- runtime disabled/unconfigured bypass;
- Decision Control Plane closed-authority invariants;
- canonical telemetry minimization;
- canonical cost-accounting integration.

## 4. Negative and failure-path tests

Required cases:

- Jev unavailable;
- Jev timeout;
- Jev malformed payload;
- Jev returns contradictory decisions;
- Jev returns low confidence;
- Jev returns a semantically unsafe "allow" signal while deterministic policy denies;
- provider request cancelled by execution deadline;
- telemetry persistence failure;
- cost-accounting persistence failure;
- external decision state contains secrets;
- decision state exceeds configured limits;
- model-routing shadow observer throws;
- tool-risk observer throws;
- prompt-security observer throws;
- trajectory observer throws;
- RAG observer receives no evidence;
- RAG observer receives an empty claim;
- decision provider configured but shadow feature flag disabled;
- shadow flag enabled but API key absent.

SHADOW observer failures must not change canonical DataNexus runtime outcomes.

## 5. Data-boundary review before live external calls

Before setting `JEV_SHADOW_RUNTIME_ENABLED=true` in an environment containing sensitive enterprise data, verify:

- TypeSafe/Jev data retention;
- deletion policy;
- model-training use of submitted payloads;
- processing region;
- subprocessors;
- DPA availability;
- relevant security attestations;
- incident response commitments;
- provider rate limits and availability commitments;
- acceptable data classifications for external processing.

Until that review is complete, live Jev calls with sensitive production content remain disabled.

## 6. Shadow benchmark

Create a sanitized DataNexus benchmark containing representative:

- safe and unsafe tool calls;
- prompt injection and exfiltration attempts;
- governed model-routing examples;
- successful, partial and failed native trajectories;
- supported, contradicted and unsupported claim/citation examples.

Measure per decision family:

- precision;
- recall;
- false-allow rate;
- false-block rate;
- confidence calibration;
- human override rate;
- latency;
- availability;
- token usage and cost.

No family may move from SHADOW to ADVISORY or ACTIVE solely because the integration is operational.

## 7. Promotion gate

Promotion requires:

- benchmark evidence;
- versioned threshold decision;
- accountable owner approval;
- provider/model identity recorded;
- question-schema version frozen;
- negative/failure-path suite green;
- exact-head protected CI green;
- rollback target defined.

ACTIVE semantic output may become an input to deterministic policy evaluation only. It never becomes independent execution authority.

## 8. Activation sequence

```text
IMPLEMENTED
  -> exact-head CI
  -> vendor/data-boundary review
  -> credential configuration
  -> SHADOW activation
  -> benchmark + calibration
  -> ADVISORY
  -> governed promotion review
  -> ACTIVE policy input
```

Production activation, credential configuration and lifecycle promotion are intentionally separate from code implementation and require their corresponding governance gates.
