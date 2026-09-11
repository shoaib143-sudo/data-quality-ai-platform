# Major Discussion — Agent Classification Framework and Portfolio Review

**Date:** 2026-09-11  
**Decision owner:** DataNexus AI architecture  
**Status:** Accepted for portfolio-wide use

## Why this discussion matters

DataNexus has reached the point where a single label such as `goal-based`, `learning`, `utility-based`, or `orchestrator` is no longer sufficient to describe an agent accurately.

Those labels describe different concerns. Decision architecture, autonomy, orchestration role, human approval, memory, tool use, learning, explainability, and multi-agent topology must be documented independently.

The architecture decision is recorded in:

`Architecture/2026-09-11-ADR-007-agent-classification-framework.md`

This note captures the discussion outcome and the portfolio-level implications.

## Agreed Principle

Every DataNexus agent must be classified using the same multi-dimensional framework.

The classification must always separate:

- **what is implemented today**; and
- **what is planned or targeted for the future**.

An agent must not be called `goal-based`, `utility-based`, `learning`, `multi-agent`, `self-healing`, or similarly advanced solely because those behaviours are part of the roadmap.

Claims must follow runtime evidence.

## Required Classification Dimensions

Every current and future agent should be reviewed across the following dimensions:

1. Decision architecture — simple reflex, model-based reflex, goal-based, utility-based, learning, or hybrid.
2. Reasoning architecture — reactive, deliberative, or hybrid reactive-deliberative.
3. Operational role — specialist, analyst, investigator, recovery orchestrator, etc.
4. Control pattern — advisory, open-loop, closed-loop, self-healing.
5. Autonomy level — read-only, advisory, bounded autonomy, governed autonomy.
6. Human governance — human-in-the-loop, human-on-the-loop, human-out-of-the-loop, or mixed by risk tier.
7. State model — stateless, stateful, episodic/operational memory.
8. Trigger model — event-driven, scheduled, user-initiated, condition-driven, predictive, or hybrid.
9. Agent topology — single agent, centralized orchestrator, hierarchical multi-agent, peer-to-peer, supervisor/specialist.
10. Coordination pattern — coordinator, delegation, supervisor-worker, sequential/parallel specialists, etc.
11. Knowledge architecture — rule-based, evidence-grounded, retrieval/knowledge augmented, research enabled, web research enabled.
12. Tooling model — no tools, read-only tools, governed tools, mutation tools with approval, dynamic tool selection.
13. Learning/adaptation — none, static policy with history, outcome-informed, governed adaptive learning, online learning.
14. Determinism — deterministic, probabilistic, or hybrid.
15. Explainability — rule/evidence/RCA/user-facing explainable.
16. Risk/governance posture — policy constrained, risk tiered, reversible, auditable, least privilege, fail closed, approval gated.
17. Environment observability — fully or partially observable, with or without active investigation.
18. Recovery/validation behaviour — retry only, diagnose/recommend, remediate/validate, rollback/escalation aware.

## Important Taxonomy Clarifications

### Goal-Based is not the same as having a goal

A component should be classified as goal-based only when it actually evaluates or plans future action sequences toward a target state.

A deterministic rule engine with a business objective remains reflex/model-based if it does not perform planning.

### Learning is not the same as storing history

Persisted past outcomes, logs, or memory do not by themselves make an agent a learning agent.

Learning requires validated experience to alter future decisions, ranking, policy, thresholds, or strategy.

### Orchestrator and Multi-Agent are separate dimensions

`Orchestrator` describes an operational/coordination role.

`Multi-agent` describes system topology.

Neither replaces the classical decision architecture classification.

### Agent vs Workflow must remain explicit

Some DataNexus components may be better described today as governed controllers or agentic workflows rather than fully autonomous AI agents.

The label should mature only when the runtime does.

## Execution Recovery Agent — Agreed Example

The recent Execution Recovery Agent discussion exposed why this framework is needed.

### Current production state

The most defensible current classification is:

- Decision architecture: `MODEL_BASED_REFLEX`
- Reasoning: `REACTIVE`
- Operational role: `RECOVERY_ORCHESTRATOR`
- Control pattern: governed closed-loop recovery controller
- Autonomy: `BOUNDED_AUTONOMY`
- Human governance: mixed by risk tier; Tier 2/3 require explicit user approval
- State: `STATEFUL`
- Trigger: `EVENT_DRIVEN`
- Knowledge: evidence-grounded and rule-based
- Tooling: governed tool use
- Learning: static policy with retained history; not yet learning
- Determinism: deterministic-policy dominant
- Explainability: evidence explainable
- Governance posture: policy-constrained, approval-gated, auditable, fail-closed, reversibility-aware
- Environment: partially observable
- Recovery behaviour: diagnose/recommend plus governed retry

### Target maturity

The intended mature form may evolve toward:

- `GOAL_BASED`
- `UTILITY_BASED`
- hybrid reactive-deliberative reasoning
- active RCA investigation and grounded web research
- governed remediation planning
- closed-loop self-healing with validation and rollback
- outcome-based governed learning
- hierarchical multi-agent orchestration with specialist recovery agents

Those remain target capabilities until implemented and verified.

## Portfolio-Wide Action

This framework now becomes the basis for reviewing **all DataNexus agents**.

The next portfolio review should create one classification record per agent and identify:

- current implemented classification;
- target classification;
- evidence supporting the current classification;
- gaps between current and target state;
- autonomy and mutation boundaries;
- human approval requirements;
- tool permissions;
- learning claims and whether they are genuinely implemented;
- multi-agent/orchestrator claims and whether delegation actually exists.

This review should include at minimum the governed agents already present in the platform, including Profiling, Investigator, Support, Governance Analyst, Steward, Architect, Executive, Recovery, and any other enabled specialist/runtime agents discovered from the authoritative agent definitions.

The portfolio review must use the live repository and governed runtime definitions as source of truth rather than relying on names alone.

## Governance Rule Going Forward

Any new DataNexus agent proposal should include its classification record before implementation.

Any material change to an existing agent's reasoning architecture, autonomy, mutation rights, topology, human-governance boundary, learning behaviour, or operational role should trigger a classification review.

This avoids capability drift where the implementation changes but architecture documentation continues to describe an obsolete agent type.

## Decision

The multi-dimensional classification framework is accepted as the DataNexus standard for agent architecture documentation and future agent portfolio reviews.

The architecture source of truth is ADR-007. This Major Discussion record preserves the reasoning, the Execution Recovery Agent example, and the requirement to classify the full agent portfolio consistently.
