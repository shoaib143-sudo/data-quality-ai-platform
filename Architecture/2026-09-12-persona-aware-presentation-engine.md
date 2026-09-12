# Persona-Aware Presentation Engine

**Date:** 2026-09-12  
**Status:** Accepted implementation direction

## Decision

DataNexus will not create a separate UI/UX Governance Agent for persona-specific outcome presentation.

DataNexus will instead implement a deterministic-first **Persona-Aware Presentation Engine** that transforms already-governed outcomes into persona-appropriate presentations.

The engine may decide:

- abstraction level;
- information ordering;
- approved representation primitive;
- progressive-disclosure depth;
- persona-appropriate terminology;
- emphasis of actions already authorized elsewhere.

The engine must not decide or alter:

- governance truth;
- authorization;
- organization or project scope;
- risk classification;
- certification state;
- ownership;
- policy or control effectiveness;
- approval state;
- canonical evidence.

## Architectural flow

```text
Authoritative governed outcome
  -> validated organization/project context
  -> resolved governance persona
  -> persona presentation policy
  -> presentation plan
  -> approved UI component registry
  -> persona-specific view
```

Authorization and scope resolution occur before presentation selection. Hiding or exposing presentation elements is not a security control.

## Persona baseline

The engine uses the current thirteen-persona governance baseline:

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

## Truth boundary

The engine is a consumption/presentation layer over governed outputs. It must never manufacture business impact, regulatory exposure, privacy exposure, certification, criticality, decision readiness, fitness for use, ownership, lineage, or policy/control evidence.

Every presentation plan carries the explicit truth boundary `GOVERNED_OUTCOME_ONLY` and authorization boundary `EXTERNAL_TO_PRESENTATION_ENGINE`.

## Deterministic-first posture

Initial representation selection is deterministic and policy-driven. This is intentionally simpler than introducing an autonomous agent or probabilistic UI generator.

AI-assisted representation selection may be evaluated later only if deterministic policies prove insufficient. Any such future capability must remain constrained to approved UI primitives, preserve user control, and be benchmarked against objective usability outcomes before adoption.

## Fallback

Every persona has a canonical deterministic view. If presentation policy resolution fails, the renderer must fall back to `CANONICAL_PERSONA_VIEW` rather than inventing a new representation.

## UX principles

- Show the answer first. Show mechanics only when requested.
- Persona changes representation, not truth.
- A visible interactive object must have a meaningful task.
- Progressive disclosure is preferred over exposing technical mechanics by default.
- Accessibility and responsive behavior are properties of approved components, not optional output styling.
- The same governed outcome may be rendered differently by persona while preserving identical authoritative evidence.

## Implementation boundary

The initial engine is implemented in `lib/governance/persona-presentation.ts`.

The presentation policy includes:

- persona objective;
- abstraction level;
- primary approved representation;
- secondary representations;
- presentation priorities;
- content explicitly suppressed from that persona's default view.

The policy does not confer access rights and does not calculate governance outcomes.
