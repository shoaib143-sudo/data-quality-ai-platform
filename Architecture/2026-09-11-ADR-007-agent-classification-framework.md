# ADR-007 — Multi-Dimensional Agent Classification Framework

**Date:** 2026-09-11  
**Status:** Accepted  
**Applies to:** All current and future DataNexus AI agents, agentic workflows, orchestration agents, specialist agents, and governed autonomous components

## Context

DataNexus AI now contains multiple agents and agent-like execution components with materially different decision architectures, autonomy levels, governance boundaries, tool access, state models, and coordination responsibilities.

A single label such as `goal-based`, `learning`, or `orchestrator` is insufficient because those labels describe different dimensions of an agent. For example, `goal-based` describes a decision architecture, while `orchestrator` describes an operational/coordination role. Treating them as mutually exclusive categories leads to ambiguous architecture documentation and can overstate capabilities that are only planned rather than implemented.

DataNexus therefore adopts a multi-dimensional classification framework. Every agent must be classified against the same dimensions, and the classification must distinguish the agent's **current implemented state** from its **target or planned state**.

## Decision

All DataNexus agents MUST be classified using the dimensions below. No agent should be represented only by a single `agent_type` label.

### 1. Decision Architecture

Describes how the agent selects actions.

Allowed classifications include:

- `SIMPLE_REFLEX` — action depends primarily on the current percept or event using condition-action rules.
- `MODEL_BASED_REFLEX` — action depends on the current percept plus maintained internal state or a model of the environment.
- `GOAL_BASED` — the agent evaluates or plans actions in terms of future states that satisfy an explicit goal.
- `UTILITY_BASED` — the agent compares valid alternatives using an explicit utility, reward, cost, risk, or preference model.
- `LEARNING` — the agent changes future decision behaviour based on validated experience or feedback.
- `HYBRID` — more than one implemented decision architecture is materially present; each constituent type must be stated.

A business objective alone does not make an agent `GOAL_BASED`. Goal-based classification requires implemented planning or evaluation of alternative future states.

Persisting history alone does not make an agent `LEARNING`. Learning requires validated historical outcomes to alter future behaviour or policy.

### 2. Reasoning Architecture

Describes how the agent reasons over time.

- `REACTIVE` — responds primarily to current events and known state.
- `DELIBERATIVE` — constructs, evaluates, or searches plans before acting.
- `HYBRID_REACTIVE_DELIBERATIVE` — combines rapid rule-driven handling with deliberate planning for more complex cases.

### 3. Operational Role

Describes what responsibility the agent owns in the platform.

Examples:

- `PROFILING_SPECIALIST`
- `GOVERNANCE_ANALYST`
- `INVESTIGATION_SPECIALIST`
- `RECOVERY_ORCHESTRATOR`
- `DISCOVERY_SPECIALIST`
- `LINEAGE_SPECIALIST`
- `DATA_QUALITY_SPECIALIST`
- `SEMANTIC_INDEX_SPECIALIST`
- `OBSERVABILITY_SPECIALIST`

Operational role is separate from decision architecture.

### 4. Control Pattern

Describes the control-loop behaviour.

Examples:

- `OPEN_LOOP`
- `CLOSED_LOOP`
- `CLOSED_LOOP_SELF_HEALING`
- `ADVISORY_ONLY`

A self-healing classification requires observation after remediation and verification that the original objective was restored; applying a change without validation is not self-healing.

### 5. Autonomy Level

Describes how much independent authority the agent has.

- `READ_ONLY`
- `ADVISORY`
- `BOUNDED_AUTONOMY`
- `GOVERNED_AUTONOMY`
- `FULL_AUTONOMY` — not a default DataNexus posture and requires explicit architecture approval.

DataNexus should prefer bounded or governed autonomy over unrestricted autonomy.

### 6. Human Governance Model

Describes where humans participate in the control loop.

- `HUMAN_IN_THE_LOOP`
- `HUMAN_ON_THE_LOOP`
- `HUMAN_OUT_OF_THE_LOOP`
- `MIXED_BY_RISK_TIER`

Where authority varies by risk tier, the classification must state the tier boundary. For example, Tier 1 recovery may be human-on-the-loop while Tier 2 and Tier 3 remediation require human-in-the-loop approval.

### 7. State Model

- `STATELESS`
- `STATEFUL`
- `STATEFUL_WITH_EPISODIC_MEMORY`
- `STATEFUL_WITH_VALIDATED_OPERATIONAL_MEMORY`

Operational persistence is distinct from learning. A stateful agent can retain evidence without changing policy.

### 8. Trigger Model

Examples:

- `EVENT_DRIVEN`
- `SCHEDULED`
- `USER_INITIATED`
- `CONDITION_DRIVEN`
- `PREDICTIVE`
- `HYBRID_TRIGGERED`

### 9. Agent Topology

Describes how the agent participates in the wider system.

- `SINGLE_AGENT`
- `CENTRALIZED_ORCHESTRATOR`
- `HIERARCHICAL_MULTI_AGENT`
- `PEER_TO_PEER_MULTI_AGENT`
- `SUPERVISOR_SPECIALIST`

`ORCHESTRATOR` and `MULTI_AGENT` are topology/coordination classifications, not replacements for decision architecture.

### 10. Coordination Pattern

Where more than one agent participates, classify the interaction pattern.

Examples:

- `NONE`
- `CENTRAL_COORDINATOR`
- `SUPERVISOR_WORKER`
- `DELEGATION`
- `CONSENSUS`
- `SEQUENTIAL_SPECIALISTS`
- `PARALLEL_SPECIALISTS`

### 11. Knowledge Architecture

Describes what evidence the agent may use.

Examples:

- `RULE_BASED`
- `EVIDENCE_GROUNDED`
- `RETRIEVAL_AUGMENTED`
- `KNOWLEDGE_AUGMENTED`
- `RESEARCH_ENABLED`
- `WEB_RESEARCH_ENABLED`

For DataNexus, external research must remain subordinate to platform evidence and governance policy. Web research must use reliable sources, sanitize sensitive content, verify version compatibility, and seek corroboration before materially supporting a production remediation.

### 12. Tooling Model

Examples:

- `NO_TOOLS`
- `READ_ONLY_TOOLS`
- `GOVERNED_TOOL_USING`
- `MUTATION_TOOLS_WITH_APPROVAL`
- `DYNAMIC_TOOL_SELECTION`

Tool availability does not itself imply permission. Authorization and policy enforcement remain deterministic platform controls.

### 13. Learning and Adaptation

Classify separately from state/memory.

- `NONE`
- `STATIC_POLICY_WITH_HISTORY`
- `OUTCOME_INFORMED`
- `GOVERNED_ADAPTIVE_LEARNING`
- `ONLINE_LEARNING`

DataNexus must not claim an agent is learning merely because it stores past outcomes. A learning classification requires evidence that validated experience changes future decisions, ranking, policy, thresholds, or strategy.

### 14. Determinism Model

- `DETERMINISTIC`
- `PROBABILISTIC`
- `HYBRID_DETERMINISTIC_PROBABILISTIC`

Preferred DataNexus pattern for governed agents:

- probabilistic/reasoning components may diagnose, interpret, rank, or propose;
- deterministic controls enforce authorization, project scope, retry ceilings, approval requirements, prohibited actions, durable state transitions, and evidence integrity.

### 15. Explainability Model

Examples:

- `OPAQUE`
- `RULE_EXPLAINABLE`
- `EVIDENCE_EXPLAINABLE`
- `RCA_EXPLAINABLE`
- `USER_FACING_EXPLAINABLE`

For user-facing operational agents, explanations should be written in simple English with technical details available separately.

### 16. Risk and Governance Posture

Agents should be classified using applicable governance traits such as:

- `POLICY_CONSTRAINED`
- `RISK_TIERED`
- `REVERSIBILITY_AWARE`
- `AUDITABLE`
- `LEAST_PRIVILEGE`
- `FAIL_CLOSED`
- `APPROVAL_GATED`

These are not marketing labels; they must correspond to implemented controls.

### 17. Environment Observability

- `FULLY_OBSERVABLE`
- `PARTIALLY_OBSERVABLE`
- `PARTIALLY_OBSERVABLE_WITH_ACTIVE_INVESTIGATION`

Most operational agents should be assumed to operate in a partially observable environment unless complete authoritative state can be proven.

### 18. Recovery / Validation Behaviour

Where applicable, classify whether the agent supports:

- `NO_RECOVERY`
- `RETRY_ONLY`
- `DIAGNOSE_AND_RECOMMEND`
- `DIAGNOSE_REMEDIATE_VALIDATE`
- `DIAGNOSE_REMEDIATE_VALIDATE_ROLLBACK`
- `ESCALATION_AWARE`

A remediation should not be considered successful until the affected workload or control objective has been independently validated.

## Required Agent Classification Record

Every governed DataNexus agent MUST maintain a classification record using at least the following structure:

```text
Agent: <agent name>

Decision Architecture:
  Current: <classification>
  Target: <classification or NONE>

Reasoning Architecture:
  Current: <classification>
  Target: <classification or NONE>

Operational Role:
  <role>

Control Pattern:
  Current: <classification>
  Target: <classification or NONE>

Autonomy:
  Current: <classification>

Human Governance:
  <classification and tier boundaries>

State:
  <classification>

Trigger:
  <classification>

Topology:
  Current: <classification>
  Target: <classification or NONE>

Coordination:
  <classification>

Knowledge:
  Current: <classification>
  Target: <classification or NONE>

Tooling:
  <classification>

Learning:
  Current: <classification>
  Target: <classification or NONE>

Determinism:
  <classification>

Explainability:
  <classification>

Risk / Governance:
  <one or more implemented traits>

Environment:
  <classification>

Recovery / Validation:
  <classification where applicable>
```

## Current vs Target Rule

The classification MUST reflect implemented behaviour, not aspiration.

If a capability is planned but not implemented, record it as `Target`, `Planned`, or `Not implemented`. Do not classify an agent as utility-based, learning, multi-agent, deliberative, self-healing, or autonomous unless the corresponding runtime behaviour and governance controls exist.

## Agent vs Workflow Rule

DataNexus must distinguish an AI agent from a deterministic workflow or controller.

A workflow/controller may be stateful, event-driven, and automated without being a fully agentic system. Components should be described accurately according to their implemented level of reasoning, planning, tool selection, adaptation, and autonomy.

Where a component is primarily deterministic, the architecture record may use a label such as `governed controller`, `agentic workflow`, or `orchestration component` until stronger agentic capabilities are implemented.

## Example — Execution Recovery Agent

### Current Production Classification

```text
Agent: Execution Recovery Agent

Decision Architecture:
  Current: MODEL_BASED_REFLEX
  Target: GOAL_BASED + UTILITY_BASED

Reasoning Architecture:
  Current: REACTIVE
  Target: HYBRID_REACTIVE_DELIBERATIVE

Operational Role:
  RECOVERY_ORCHESTRATOR

Control Pattern:
  Current: CLOSED_LOOP_RECOVERY_CONTROLLER
  Target: CLOSED_LOOP_SELF_HEALING

Autonomy:
  Current: BOUNDED_AUTONOMY

Human Governance:
  MIXED_BY_RISK_TIER
  Tier 1: HUMAN_ON_THE_LOOP where permitted
  Tier 2/3: HUMAN_IN_THE_LOOP
  Tier 4: HUMAN_ONLY

State:
  STATEFUL

Trigger:
  EVENT_DRIVEN

Topology:
  Current: SINGLE_RECOVERY_ORCHESTRATION_COMPONENT
  Target: HIERARCHICAL_MULTI_AGENT

Coordination:
  Current: CENTRALIZED
  Target: CENTRAL_COORDINATOR + SPECIALIST_DELEGATION

Knowledge:
  Current: EVIDENCE_GROUNDED + RULE_BASED
  Target: KNOWLEDGE_AUGMENTED + WEB_RESEARCH_ENABLED

Tooling:
  GOVERNED_TOOL_USING

Learning:
  Current: STATIC_POLICY_WITH_HISTORY
  Target: GOVERNED_ADAPTIVE_LEARNING

Determinism:
  Current: DETERMINISTIC_POLICY_DOMINANT
  Target: HYBRID_DETERMINISTIC_PROBABILISTIC

Explainability:
  Current: EVIDENCE_EXPLAINABLE
  Target: RCA_EXPLAINABLE + USER_FACING_EXPLAINABLE

Risk / Governance:
  POLICY_CONSTRAINED
  RISK_TIERED
  APPROVAL_GATED
  AUDITABLE
  REVERSIBILITY_AWARE
  FAIL_CLOSED
  LEAST_PRIVILEGE

Environment:
  PARTIALLY_OBSERVABLE
  Target: PARTIALLY_OBSERVABLE_WITH_ACTIVE_INVESTIGATION

Recovery / Validation:
  Current: DIAGNOSE_AND_RECOMMEND + GOVERNED_RETRY
  Target: DIAGNOSE_REMEDIATE_VALIDATE_ROLLBACK + ESCALATION_AWARE
```

The current Execution Recovery implementation is therefore more accurately described as a **stateful, evidence-grounded, model-based reflex recovery controller/orchestration component with bounded, human-governed authority**. It should not yet be called a full goal-based, utility-based, learning, or hierarchical multi-agent system until those capabilities are implemented.

## Governance Requirements

1. Every existing DataNexus agent must be assessed against this framework.
2. Every new agent proposal must include a proposed classification before implementation.
3. Architecture reviews must compare claimed classifications to actual runtime evidence.
4. Planned classifications must never be presented as current production capabilities.
5. Changes that materially alter decision architecture, autonomy, learning, topology, human governance, or mutation authority require an architecture update.
6. Classification records should be reviewable alongside agent definitions, tool permissions, policies, and production evidence.
7. The framework should be used consistently in architecture documents, agent catalogues, governance reviews, capability matrices, and major design discussions.

## Consequences

### Positive

- Prevents conflating agent intelligence, autonomy, orchestration, and learning.
- Makes current versus planned capability explicit.
- Improves governance review and auditability.
- Creates a common vocabulary across all DataNexus agents.
- Makes maturity progression measurable without overstating production behaviour.
- Supports future multi-agent and self-healing architecture without forcing premature classification.

### Trade-offs

- Agent documentation becomes more detailed.
- Classification must be updated as implementations evolve.
- Some existing components may need to be re-labelled from `agent` to `agentic workflow` or `controller` until their runtime behaviour supports a stronger classification.

## Decision Summary

DataNexus adopts a **multi-dimensional agent classification framework** as the canonical standard for all agents. Decision architecture, reasoning style, operational role, topology, autonomy, human governance, state, triggers, knowledge, tooling, learning, determinism, explainability, risk posture, environment observability, and recovery behaviour are independent dimensions and must be documented separately.

The source of truth is the implemented runtime behaviour. Classification follows evidence, not aspiration.
