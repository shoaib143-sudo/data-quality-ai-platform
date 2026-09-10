# ADR-008: AI resource budget scope composition

Date: 2026-09-10
Status: Accepted

## Context

ADR-006 intentionally deferred combined PROJECT, AI_SYSTEM, and AGENT resource-budget enforcement until cross-scope semantics were explicit. DataNexus now has canonical provider-observed cost accounting and existing atomic request/concurrency admission, so scope composition must be deterministic before broader enforcement.

## Decision

Applicable enabled resource-budget policies are conjunctive constraints, not overrides. A request must satisfy every applicable scope for which authoritative runtime identity is available.

1. `PROJECT / PROJECT` applies to every governed reasoning invocation in the project.
2. `AI_SYSTEM / <ai-system-id>` applies only when the routed governed AI system identity is known and exactly matches `scope_key`.
3. `AGENT / <agent-definition-id>` applies only when the invoking agent definition identity is explicitly carried in the routing context and exactly matches `scope_key`.
4. Disabled effective rows impose no constraint. They do not disable broader or narrower scopes.
5. No scope has precedence over another. No policy silently replaces another policy.
6. For provider-side request ceilings such as `max_output_tokens_per_request`, the effective ceiling is the minimum non-null value across all applicable enabled policies because satisfying all independent upper bounds is equivalent to their minimum.
7. Rate and concurrency controls are admitted independently against every applicable policy that defines the corresponding limit. Failure of any admission denies the invocation. Any leases already acquired in that attempt are released before returning denial.
8. The exact effective policy-version IDs are retained as execution evidence.
9. Missing AI-system or agent identity never causes a policy to be guessed from names, labels, or mutable metadata. Only scopes with authoritative identity may apply.
10. Cost limits remain governed configuration but hard pre-invocation dollar enforcement is not activated merely because pricing exists. Exact hard enforcement requires an authoritative pre-invocation provider/model cost bound; current `ReasoningProvider` exposes provider-observed usage only after execution. DataNexus must not estimate token usage or invent a quote.

## Consequences

This composition is monotonic: adding an applicable policy can only maintain or tighten execution constraints. It avoids both "most specific wins" and implicit precedence. Existing project-only callers remain compatible, while routed AI-system identity and explicit agent identity can add constraints.

The atomic admission RPC is generalized to accept any exact current policy version in the same project; its existing per-policy request and lease accounting remains unchanged.

A future spend-enforcement change must introduce a provider-authoritative preflight quote or exact maximum-cost contract before `max_cost_usd_per_request` and strict no-overshoot daily budget reservations can block execution prospectively.
