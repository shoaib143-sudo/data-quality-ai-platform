# Trusted Operational Governance Implementation Map

**Date:** 2026-09-10  
**Status:** Active implementation map  
**Parent decision:** `Architecture/2026-09-10-ADR-007-trusted-operational-governance-capability-model.md`

## Purpose

This document converts ADR-007 into a dependency-aware implementation map. It does not create a second architecture. It defines how existing DataNexus subsystems are assembled into complete trusted operational governance capabilities.

The governing rule is:

> A capability is complete only when its real workflow, authorization, evidence, policy enforcement, AI behavior, operations, audit and outcome verification work together.

P0-P5 are permanent release invariants and must remain green for every increment.

## Existing substrate to reuse

The current repository already contains substantial implementation that must be extended rather than duplicated:

- `lib/profiling/`: profiling lifecycle and evidence production.
- `lib/data-quality/`: automation, autonomous operations, remediation, reprofile and verification.
- `lib/governance/`: classification, governed autonomy, audit, lineage adapters/change impact, policy decisions and governance intelligence.
- `lib/agents/`: governed agents, memory/learning, resumable execution and governance workers.
- `lib/ai/`: governed model/retrieval/evaluation/provider infrastructure.
- `lib/orchestration/`: durable workload execution and pool isolation.
- `app/`: existing product surfaces for catalog, datasets, classification/privacy, contracts, data quality, documents, agents and AI insights.
- `scripts/verify-*`: existing static and behavioral contract verification.

New implementation should first integrate these assets into real journeys. New infrastructure is justified only when an actual journey cannot be completed safely with the current substrate.

## Architectural workstreams

### A. Governance truth and lifecycle

Authoritative PostgreSQL/Supabase state for:

- glossary and governed terms
- Critical Data Elements
- ownership and stewardship
- policy/control applicability
- classification decisions
- DQ rules and versions
- contracts and versions
- certification
- exceptions/waivers
- incidents/issues/remediation
- authoritative-source designation
- usage purpose
- retention and lifecycle
- jurisdiction/sovereignty metadata where applicable

Authoritative truth must remain distinct from AI suggestions and derived intelligence.

### B. Evidence and control plane

Every material governance conclusion must be traceable through four truth classes:

1. **AUTHORITATIVE_FACT**: approved catalog/governance truth.
2. **OBSERVED_EVIDENCE**: profile metrics, rule results, lineage observations, document facts.
3. **DERIVED_INTELLIGENCE**: risk scores, anomaly inference, AI hypotheses and recommendations.
4. **GOVERNED_DECISION**: approved classifications, waivers, certifications, accepted remediations and policy decisions.

The platform must preserve evidence references, object/version scope, actor, model/rule version, timestamps, confidence where relevant, decision state and outcome.

### C. Governance Control Catalog

Controls become executable product objects rather than documentation only. Each control should define:

- objective
- scope/risk tier
- owner
- trigger
- enforcement point
- required evidence
- pass/fail/not-applicable semantics
- remediation/escalation
- review cadence
- verification test
- operational metric/SLO where relevant

Control evaluation must consume authoritative facts and observed evidence and must not silently convert model output into authoritative truth.

### D. Data Quality control system

Profiling remains observation. DQ becomes a governed control lifecycle:

`Profile -> Candidate Rule -> Approval -> Rule Version -> Execution -> Result -> Finding -> Issue -> Remediation -> Reprofile -> Verification -> Outcome`

Result semantics must explicitly distinguish:

- PASS
- FAIL
- NOT_MEASURED
- UNAVAILABLE
- ERROR
- NOT_APPLICABLE
- WAIVED, only when a valid governed waiver applies

### E. Data Estate Knowledge Graph

GraphProvider remains the relationship abstraction. PostgreSQL remains the initial authoritative implementation.

Priority relationships:

`Dataset -> Column -> CDE -> Policy/Control -> DQ Rule -> Contract -> Owner/Steward -> Consumer/Report/Process`

Field lineage must preserve transformation type and source/target field identity so change impact can be computed, not guessed.

### F. Governed investigation and agents

All agents use a shared evidence-planning/investigation layer:

`Question/Finding -> Scope -> Evidence Plan -> Truth + Retrieval + Graph + History -> Evidence Bundle -> Reasoning -> Recommendation`

Agent differences should be role, tool allowlist, planner policy, evidence requirements, action authority and evaluation rubric, not duplicated infrastructure.

The model never decides its own authorization. Project/object scope, tool permissions, risk tier, approval requirements, output contracts and resource budgets are deterministic controls outside the model.

### G. Governed action and learning

Action lifecycle:

`Recommendation -> Policy Decision -> Human Approval if required -> Durable Action -> Verification -> Outcome -> Evaluation -> Learning`

Only verified outcomes may be promoted into reusable episodic/semantic learning. Failed or superseded outcomes remain retrievable as historical evidence but cannot be treated as successful precedent.

### H. Operational assurance

Reliability is measured at workflow level, not only HTTP/process level.

Priority SLIs include:

- source discovery completion
- profiling completion
- DQ evaluation completion
- freshness-breach detection delay
- investigation completion latency
- approval queue age
- remediation verification latency
- evidence completeness
- critical-asset control coverage
- agent groundedness/authorization correctness
- durable-job saturation/retry exhaustion

Each critical journey requires normal, unauthorized/adversarial and degraded/failure-path tests.

## Dependency graph

```text
Reference estate + journey harness
          |
          v
Evidence taxonomy + control catalog + lifecycle truth
          |
          +-----------------------------+
          |                             |
          v                             v
Sensitive-data governance         DQ incident governance
          |                             |
          +--------------+--------------+
                         v
                Field lineage + change governance
                         |
                         v
              Shared investigation engine
                         |
                         v
               Specialized agent journeys
                         |
                         v
            Governed action + verification
                         |
                         v
               Outcome learning/evaluation
                         |
                         v
       Stress/failure/security + final certification
```

This graph expresses dependency order, not isolated phases. Each delivered increment must remain a working vertical slice.

## Repository ownership map

| Capability area | Primary existing paths | Expected extension pattern |
|---|---|---|
| Source/catalog/profile | `lib/connectors`, `lib/catalog`, `lib/profiling`, `app/datasets`, `app/catalog` | Extend existing lifecycle and evidence references |
| Governance truth | `lib/governance`, `app/classification`, `app/classification-privacy`, `app/contracts` | Forward migrations + governed service/RPC transitions |
| DQ lifecycle | `lib/data-quality`, `app/data-quality` | Add rule execution/result semantics and incident linkage |
| Lineage/change | `lib/governance/lineage-*` | Add field mappings, transformation evidence and business impact |
| AI/RAG | `lib/ai`, `lib/governance/ai-*` | Reuse governed router/retrieval/evaluation boundaries |
| Agents | `lib/agents` | Specialize via contracts and shared evidence bundles |
| Orchestration | `lib/orchestration`, governance/DQ workers | Reuse workload pools, capacity and durable state |
| Assurance | `scripts/verify-*`, `.github/workflows` | Add journey-level behavioral gates, preserve existing verifiers |
| Product UX | `app/*` | Shift from CRUD-first pages to evidence/decision/action views |

## Migration and compatibility rule

- Never modify a released migration.
- Add forward migrations only.
- Preserve single-organization deployment semantics.
- Treat wrong organization/project identifiers as configuration/data errors and fail closed.
- Prefer additive schemas and compatibility views/RPCs during transitions.
- Backfill derived governance state explicitly and audit the backfill.

## Release rule

A vertical increment may merge only when:

1. the user journey works through UI/API/runtime,
2. authoritative and derived states are not conflated,
3. authorization and direct-bypass tests pass,
4. evidence/provenance is complete,
5. failure/retry semantics are deterministic,
6. audit events are present,
7. required workflow SLIs are emitted,
8. existing P0-P5 gates remain green,
9. normal, adversarial and degraded acceptance paths pass,
10. live/deployed behavior is validated when CI cannot prove the deployed boundary.

## Infrastructure restraint

OpenSearch, ClickHouse and additional infrastructure are not implementation milestones. They are scale responses. The PostgreSQL/Supabase + pgvector + GraphProvider baseline remains authoritative until measured scale or latency evidence demonstrates that another plane is necessary.
