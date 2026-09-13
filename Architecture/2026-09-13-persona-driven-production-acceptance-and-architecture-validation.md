# Persona-Driven Production Acceptance and Architecture Validation

**Date:** 2026-09-13 (Asia/Singapore)  
**Status:** Accepted validation direction  
**Scope:** Production UI, persona authorization, governed workflows, architecture and design conformance

## Decision

DataNexus AI will use the established thirteen governance personas as an explicit production acceptance matrix.

Each persona must be exercised through the real authenticated application and through the work that persona is expected to perform. Acceptance is not limited to page rendering, route reachability or build success. The validation must also determine whether the observed behavior conforms to the intended architecture, design, authorization model, governance boundaries and previously agreed product contracts.

The thirteen-persona baseline remains unchanged:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Product Owner
5. Data Steward
6. Data Governance Specialist
7. Compliance & Risk Officer
8. Privacy & Security Officer
9. Data Governance Admin
10. Data Custodian / Technical Steward
11. Source System / Application Owner
12. Metadata Analyst
13. Data Quality Analyst

This decision changes the acceptance method, not the persona authority model.

## Validation contract

For each persona, production acceptance should cover:

1. authentication and landing experience;
2. workspace and navigation visibility;
3. expected read operations;
4. expected governed actions;
5. explicit denied operations;
6. cross-workspace handoffs;
7. approval and remediation flows where applicable;
8. evidence, audit and verification visibility;
9. failure, empty, unavailable and unknown states;
10. logout and session boundary behavior.

Every observed failure or mismatch should be classified against the layer that owns the contract.

| Classification | Meaning |
|---|---|
| Functionality | The expected user task does not work correctly |
| Build / runtime | The application, route, dependency or deployment fails technically |
| Design | The experience conflicts with the intended interaction or presentation contract |
| Architecture | The behavior conflicts with a durable system boundary, authority model or source-of-truth rule |
| Authorization / governance | Capability, persona, workspace, project or approval boundaries are applied incorrectly |
| Agreed behavior | The implementation conflicts with an already accepted ADR, product decision or governance contract |
| Evidence / verification | The system cannot prove the claimed state, action or outcome |

A defect may belong to more than one classification, but the report should identify the primary owning layer and any contributing layers.

## Authority boundaries preserved

Persona-driven acceptance must not change authority simply to make a user journey pass.

The following remain separate controls:

- persona presentation and workspace eligibility;
- organization or instance membership;
- project capability;
- workspace access;
- action-specific authorization;
- workflow approval authority;
- row-level security;
- server-side policy evaluation;
- governed mutation authority;
- audit and evidence authority.

A persona test that encounters an intended denial is a successful authorization result when the denial matches the accepted model. A persona test that reaches a dead end because the UI offered a path that an independent server or workspace gate correctly denies is a UX or presentation defect, not justification to widen access.

This is consistent with the September 13 remediation architecture, where project action capability and workspace access are independent gates.

## Production acceptance lifecycle

Persona validation inherits the existing production lifecycle distinction:

```text
Implemented
  -> Tested
  -> Merged
  -> Deployed
  -> Authenticated persona verification
  -> Production accepted
```

A green build or successful deployment does not establish persona-level production acceptance.

Likewise, automated tests do not replace authenticated production verification. Automated positive, negative, failure and adversarial checks should provide repeatable assurance, while persona execution confirms the integrated behavior of the deployed product.

## Evidence requirements

Each persona test should preserve enough evidence to answer:

- which persona was used;
- which organization/project context was active;
- which task was attempted;
- expected behavior;
- actual behavior;
- whether the action was allowed, denied or unavailable;
- which capability and workspace gates applied;
- whether a production mutation occurred;
- relevant route, workflow or governed object;
- failure classification;
- architecture/design basis for the expected result;
- verification outcome;
- remediation status if a defect was found.

Sensitive credentials and secrets must not be included in the evidence record.

## Cross-persona consistency requirements

The same underlying governed truth must remain consistent across personas.

Persona-specific presentation may change terminology, prioritization, information density and available navigation. It must not create conflicting facts, alter policy truth, fabricate authority, reinterpret certification, change ownership, or produce different governance outcomes solely because a different persona is viewing the same object.

The Persona-Aware Presentation Engine therefore remains a presentation layer over canonical governed truth.

## Failure handling

When a persona workflow fails:

1. preserve the observed evidence;
2. determine whether the result is an intended denial or a defect;
3. identify the authoritative contract involved;
4. avoid widening permissions as the default remediation;
5. create the narrowest fix at the owning layer;
6. add deterministic positive and negative regression coverage;
7. add adversarial coverage for governance-sensitive boundaries;
8. redeploy and repeat the exact persona scenario;
9. confirm no unrelated persona or authority regression was introduced.

## Relationship to existing architecture

This decision does not replace the existing persona ADRs, single-organization deployment boundary, workspace policy, governed remediation rules or presentation-engine architecture.

It turns those decisions into an explicit end-to-end production validation surface.

The most relevant existing records include:

- `ADR-2026-09-09-role-based-governance-landing-pages.md`
- `ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`
- `ADR-2026-09-10-expand-governance-personas-with-analyst-roles.md`
- `2026-09-10-ADR-007-single-organization-deployment-boundary.md`
- `2026-09-12-persona-aware-presentation-engine.md`
- `2026-09-13-production-architecture-governance-and-remediation-checkpoint.md`

## Superseded interpretation

The thirteen personas were previously primarily an authorization, landing-page and presentation model.

That interpretation is now incomplete.

The current direction is that the same thirteen personas also form a production acceptance matrix for validating the integrated product from the user's governed point of view.

No persona definition is superseded by this decision.

## Unresolved items

The following remain execution work rather than accepted evidence:

1. complete authenticated production execution for all thirteen personas;
2. define the canonical task set and expected outcomes for each persona;
3. capture pass/fail evidence for each task and each relevant authorization boundary;
4. remediate failures without changing accepted authority merely to obtain a pass;
5. rerun affected personas after each remediation;
6. maintain a regression matrix so later releases can detect persona-specific breakage;
7. determine whether repeated persona validation should become a permanent automated or semi-automated release gate.

Until that evidence exists, this record establishes the validation architecture but does not claim that all thirteen personas have passed production acceptance.
