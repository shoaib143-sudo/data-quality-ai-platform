# Runtime v2 — Frozen Decisions and Autonomous Delivery Model

## Purpose

This record captures the product/governance decisions agreed for the Runtime v2 implementation program so later implementation work does not repeatedly reopen settled questions.

## Deferred item

Secret rotation remains intentionally deferred. The known chat-exposed-secret concern is treated as accepted operational risk, not an implementation blocker. Secret values must never be reproduced in source, documentation, issues, PRs, or logs.

## Approval and delegation

- conversational/read workflows remain distinct from execution authority;
- material production mutation keeps Business + Governance separation;
- same-person dual-axis approval remains prohibited;
- delegation is managed by the delegator or Data Governance Admin;
- delegate can view delegated authority but cannot alter it;
- approval/rejection comments remain mandatory;
- default approval validity is 7 days and configurable;
- any material execution-fingerprint change invalidates prior approvals immediately.

## External notifications

- Email and Teams may include signed approval links;
- messages must include a clear Open in DataNexus path;
- DataNexus remains the authoritative decision system;
- external approval authority is always revalidated server-side;
- notification delivery remains fail closed when provider configuration is absent.

## Retention and legal hold

- agent-generated artifacts: configurable 5–7 year retention;
- agent-to-agent messages: same lifecycle as execution/audit evidence;
- Governance Admin may apply legal hold that prevents normal expiry/deletion.

## Usage and cost visibility

- authorized project users may see token/cost usage for runs they are allowed to view;
- admins receive aggregate usage/cost reporting.

## Concurrency and budgets

Start with optimized configurable defaults rather than fixed business limits. Admin controls must allow increases or reductions without code changes.

Relevant limits include project/agent/tool concurrency, runtime, token budget, cost budget, step count, tool-call count, and delegation depth.

## Provider resilience

Automatic fallback is permitted only to pre-approved providers/models meeting the same or stronger data-residency, security, governance, evaluation, and production-eligibility requirements.

## Agent version lifecycle

- a newly approved version does not automatically become default;
- production use requires explicit promotion to `ACTIVE`;
- previous versions remain retained for rollback and audit;
- historical execution remains bound to the exact version used.

## Tool governance

Tools remain independently governed even when their parent agent is enabled. Each tool can have independent enable/disable state, environment restrictions, authorization, schema guardrails, limits, and audit requirements.

## Multi-agent orchestration

Agent-to-agent delegation uses explicit allow-lists, not unrestricted dynamic delegation. Delegation depth and budgets are configurable. Handoff authorization occurs before any side effect.

## Resilience and continuity defaults

- RTO: 4 hours;
- RPO: 15 minutes;
- deterministic recovery and bounded retry required;
- global/project/agent/tool kill switches required;
- CRITICAL production mutations continue to require human approval;
- break-glass elevation is time-limited, reason-bound, MFA-protected where supported, strongly audited, and followed by review.

## Production promotion and rollout

- model/provider production eligibility requires explicit approval;
- material runtime/model/provider changes use canary rollout;
- promotion/rollback decisions should be evidence driven;
- runtime evaluation and trajectory evidence are first-class artifacts rather than final-stage-only tests.

## Autonomous implementation model

The implementation assistant proceeds autonomously for items 2–29 and does not ask routine questions.

A workstream is isolated rather than stopping the program when it requires:

- user MFA/login/consent;
- new external account/provider authorization;
- a genuinely new unresolved business-policy choice;
- a destructive production action that cannot be safely inferred;
- evidence of a serious security incident.

Blocked work is labeled and skipped while independent work continues. User intervention is requested only when the blocker becomes critical path and no productive independent stream remains.

## Anti-loop rule

Do not repeat the same failing action indefinitely. After two materially identical failures without new evidence, change approach or isolate the blocker. Do not relax tests, authorization, governance, or SLO thresholds simply to make a pipeline green.

## Delivery model

Use 3–4 parallel streams where practical, with explicit migration/table ownership to minimize conflicts. Prefer small reversible PRs, additive forward-only migrations, exact-head CI, preview validation, adversarial/negative testing, and production smoke evidence before completion claims.

## Decision status

These decisions are frozen for the current Runtime v2 program unless runtime evidence exposes a genuine contradiction, security defect, or business requirement that cannot be satisfied within them.
