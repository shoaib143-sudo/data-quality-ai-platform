# Hierarchical Workflow Runtime v2 Integration

Date: 2026-10-03

## Decision

Adopt hierarchical workflow decomposition as an integration layer over the existing Agent Runtime & Execution Orchestration v2. Do not introduce a second orchestration engine.

## Existing foundations reused

- governed orchestrator node state machine and DAG validation;
- native pinned agent/tool contracts;
- durable supervisor execution, leases, checkpoints and resume;
- bounded recursion and handoff budgets;
- compensation and recovery;
- Agent Policy v2 authorization and approval services;
- operational capability catalog;
- evidence lifecycle and runtime debugger evidence;
- deterministic Job Monitor actions and runtime evidence drilldown.

## New contract

A versioned WorkflowDefinition compiles into the existing OrchestratorNode execution plan. Task types distinguish deterministic, agent, decision, approval, MCP, service, verification, notification, human and nested-workflow work.

Compilation fails closed before execution for invalid dependencies, cycles, excessive task count/depth, missing typed bindings, missing immutable input hashes, or invalid orchestrator plans.

## Integration sequence

1. Hierarchical workflow definition and compiler.
2. Bind compiled nodes to pinned agent/tool contracts and capability authorization.
3. Add authorization envelope and resource scopes.
4. Add capability broker adapters, with MCP behind capability keys.
5. Persist workflow/run/task identity and expose correlation evidence.
6. Project the real DAG into Job Monitor.
7. Add independent verification and controlled learning-candidate closure.
8. Run unit, integration, negative/failure, adversarial and regression assurance.

## Invariants

Models propose. Deterministic server-side policy authorizes.
Approval never grants execution capability by itself.
Agents never receive raw infrastructure credentials.
Retries and compensation remain idempotent and fenced.
Execution evidence is hash/provenance based and excludes raw secrets/tool payloads.
The same workflow contract supports GUIDED, GOVERNED_AUTO and FULL_AUTONOMOUS modes.
