# Learning runner activation bindings — post-implementation assurance plan

Date: 2026-10-20
Status: implementation complete on draft branch; exact-head assurance required; production activation not authorized.

## Scope completed

This change closes the remaining non-production technical gaps between the merged durable learning experiment runner and a trustworthy activation boundary:

1. append-only executable artifact manifests bound to exact agent definitions;
2. append-only HELD_OUT replay input manifests bound to sealed benchmark cases;
3. create-only private object writes with immediate byte readback, SHA-256 and size verification;
4. exact BASELINE/CANDIDATE/rollback runtime-definition bindings to one locked evaluation policy;
5. canonical proposer/evaluator UUID assignment and immutable scope attestation;
6. server-owned plan construction from canonical policy, runtime binding, sealed manifest and verified bytes;
7. current project authorization recheck through the existing authorization service;
8. deterministic $0 synthetic runner executor that refuses prospective provenance and emits no accounting artifacts.

No production migration, provider call, authority assignment, lifecycle promotion or deployment is part of this branch.

## Revalidation plan

Required evidence on one final exact head:

- Continuous Learning Governance;
- Post Implementation Assurance;
- Recovery Assurance;
- clean database reconstruction;
- Quality Gate and TypeScript;
- CodeQL and dependency security;
- Repository/Release Governance;
- V6 and P0-P5;
- Supabase Advisor Hardening;
- independent activation-binding adversarial audit;
- zero-cost synthetic activation test.

Any failed, stale, cancelled, action-required or mismatched-head gate blocks completion.

## Unit and integration tests

The $0 rehearsal must prove:

- paired baseline/candidate execution on one immutable held-out input;
- synthetic outcome cost is exactly zero;
- no reservation, settlement or cost event exists;
- prospective provenance is rejected by the synthetic executor;
- completed durable attempts are reused on resume without redispatch;
- automatic promotion remains false.

The migration/reconstruction gates must prove:

- foreign-key scope to project/policy/candidate/case identities;
- append-only mutation denial;
- service-role-only inserts;
- baseline/candidate runtime and artifact separation;
- held-out-only replay registration;
- evaluator/proposer identity separation;
- canonical binding hashes;
- no lifecycle mutation or promotion grant.

## Independent adversarial audit

The audit is separate from the dynamic runner test and checks for:

- browser-role mutation grants;
- overwrite/upsert behavior;
- signed/public URL use;
- cross-project or role-confused bindings;
- mutable runtime registry substitution;
- candidate/runtime version mismatch;
- training-data replay;
- evaluator self-review;
- direct promotion/lifecycle transitions;
- provider/network calls from the synthetic executor;
- synthetic accounting contamination.

## Negative and failure cases

| Case | Expected behavior |
|---|---|
| object upload succeeds but manifest registration fails | newly-created orphan is removed |
| object already exists with different bytes | readback digest/size fails |
| missing/corrupt object | fail before runner dispatch |
| artifact project/role/definition mismatch | reject |
| training case or wrong manifest/case/version | reject |
| policy/runtime version mismatch | reject |
| candidate definition lifecycle outside VALIDATED/CANDIDATE | reject |
| baseline lifecycle outside ACTIVE/DEPRECATED | reject |
| rollback definition unavailable/nonrecoverable | reject |
| identical baseline/candidate definition or artifact | reject |
| non-UUID proposer/evaluator | reject |
| proposer equals evaluator | reject |
| evaluator acknowledgement predates policy lock | reject |
| evaluator scope hash mismatch | reject |
| stale/current capability missing | reject at authorization |
| synthetic executor receives prospective provenance | reject |
| synthetic output contains spend/accounting refs | runner validation rejects |
| resume encounters terminal evidence | reuse; no redispatch |

## Residual policy boundary

The exact evaluator capability remains intentionally unresolved. The server authorization factory requires an explicit trusted `AuthorizationCapability` for the evaluator. This branch does not silently treat `policy.approve`, `agent.admin`, or another broad capability as independent-evaluation authority.

Choosing an existing capability or introducing a narrow `agent.learning.evaluate` capability is a governance/business-policy decision.

## Exit criteria

This branch may be called IMPLEMENTED after the exact-head suite is green. It must not be called PRODUCTION_VERIFIED until its migrations and application code are deployed through the governed release process and live provenance/journeys pass. It must not be called EMPIRICALLY_SELF_IMPROVING until a separately authorized real prospective experiment demonstrates sustained improvement without authority, safety, latency or cost regression.
