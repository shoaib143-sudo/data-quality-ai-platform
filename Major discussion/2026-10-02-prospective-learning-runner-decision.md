# Decision: Prospective Learning Runner and Residual Self-Improvement Gaps

Date: 2026-10-02  
Decision status: ADOPTED FOR IMPLEMENTATION REVIEW

## Decision

A green collection of candidate, benchmark, budget and release-control tests is not sufficient to claim an executable prospective self-improvement loop. The implementation must include a durable orchestration boundary joining the locked evaluation policy to every held-out case and both experiment arms.

PR #1115 introduces that durable orchestration boundary.

## Safety decisions

1. **Complete held-out partition in runner v1.**  
   The runner rejects post-lock subset selection. Sampling is a policy decision and requires immutable case-selection binding before partial held-out execution can be permitted safely.

2. **Claim before dispatch.**  
   Every case/arm is durably claimed before an executor may run. A crash leaves a visible unresolved claim; resume does not blindly repeat an unknown side effect/provider call.

3. **Synthetic and live evidence are different classes.**  
   A zero-cost synthetic rehearsal validates orchestration only. It cannot establish agent improvement or production evidence.

4. **Independent evidence addresses.**  
   Baseline and candidate must have distinct canonical evidence references before independent scoring.

5. **No orchestration-to-promotion shortcut.**  
   Runner completion does not approve, promote, expand authority or activate a learning candidate. Existing release admission, approval, canary and rollback gates remain authoritative.

## Residual execution-binding decision

The double-check found that learning contracts bind baseline/candidate version strings, while the native runtime executes exact agent definition identities and pins runtime/tool manifests.

The system must not silently assume that a learning version string identifies an executable `agent_definition_id`.

Before the first LIVE_PROSPECTIVE experiment, DataNexus needs one explicit immutable mapping from each evaluation arm to an executable runtime identity. This may be implemented as an evaluation-runtime binding record or another governed equivalent, but it must preserve:
- exact runtime definition and configuration;
- agent/skill/candidate/policy identity;
- rollback identity;
- lifecycle rules for evaluation;
- current administrative kill switches;
- native runtime manifest pinning.

The concrete mapping is intentionally not guessed in PR #1115 because current learning candidates are SKILL_IMPROVEMENT records and no live candidate exists to prove that their version strings are agent-definition versions.

## Release posture

PR #1115 can become implementation-ready after all exact-head gates pass. It still does not authorize:
- deployment;
- real candidate creation;
- live manifest registration;
- authority assignment;
- provider/model spend;
- live prospective execution;
- promotion.

Those remain separately governed boundaries.
