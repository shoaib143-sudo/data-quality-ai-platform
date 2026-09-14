# Agent Policy v2 — Post-Implementation State

Date: 2026-09-15
Status: Implemented, production-deployed, and post-implementation revalidated

## Scope completed

Today’s work closed the Agent Policy v2 implementation and validation cycle across authorization, approvals, execution governance, notification boundaries, Job Monitor integration, database policy, CI, and production smoke testing.

The final operating model keeps conversational/read use separate from execution authority. All 13 DataNexus personas can access the Agents workspace and Job Monitor for authorized Ask, Query, Explain, Investigate, and Recommend workflows without requiring `agent.execute`. Mutating execution remains separately permissioned and server-authoritative.

## Authorization and execution controls

The implementation enforces resource-scoped authorization with DENY precedence and server-authoritative risk determination. Production mutation rules remain fail closed. Material production mutation requires two independent approval axes: Business and Governance. A single person cannot satisfy both axes on the same request.

Business approval is scoped through Data Owner/Data Steward authority. Governance approval is scoped to the exact project/domain authority required for the request. Delegation is individual and scoped, preserves `on_behalf_of` provenance, rejects revoked delegations, and requires mandatory approval/rejection comments.

Execution identity is bound to an immutable execution fingerprint. Approval decisions, policy identity, actor identity, executor identity, fingerprint, and execution outcomes are retained as audit evidence. Cross-channel replay is prevented by the approval replay guard.

## Domain and approval-scope hardening

Synthetic bootstrap governance evidence is excluded only when the underlying record is explicitly marked `metadata.synthetic_bootstrap = true`. A domain still remains governed when it has real dataset or non-synthetic CDE evidence.

The synthetic Enterprise bootstrap record therefore does not create a false production approval obligation by itself. The real governed approval domains validated today are:

- Finance / Customer
- Profiling Demo Project / Customer
- Profiling Demo Project / general
- Profiling Demo Project / PUB

Each real production approval scope has Business and Governance coverage with satisfiable separation of duties. The same-person dual-axis prohibition remains enforced even where one identity has multiple authority relationships.

## Approval notification boundary

DataNexus remains the authoritative approval system. Email and Microsoft Teams are notification channels and fail closed when provider configuration is missing. External approval links use signed channel-bound tokens and still revalidate server-side approval authority before accepting a decision.

Webhook values are treated as secrets. Any signed webhook URL exposed in chat or other untrusted history must be rotated before use. Provider configuration does not weaken the central authorization path.

## Job Monitor and governed drilldown

The Job Monitor was reconciled with the governed execution model and now exposes domain-level execution context without bypassing resource authorization. The new dynamic `/monitoring/domain/[projectId]` drilldown is registered in the canonical resource-route contract and remains authenticated/read-only from the resource-identity perspective.

A verification drift introduced by the later Job Monitor redesign was corrected: the UX foundation verifier now validates the current domain-status architecture instead of assuming the old embedded `ExecutionStatusBadge` layout.

## Post-implementation revalidation

A fresh current-head revalidation was run rather than relying on pre-merge evidence. The validation set covered:

- Agent Policy v2 unit tests
- Independent adversarial Agent Policy audit
- Approval-hardening contracts
- Negative and failure cases
- Same-person dual-axis rejection
- Mandatory comments
- Revoked delegation rejection
- Resource ACL and DENY precedence
- Unauthorized execute/retry/cancel behavior
- Replay protection
- Execution fingerprint invalidation
- Risk recomputation and fail-closed behavior
- Production dual-approval enforcement
- Synthetic-domain exclusion behavior
- Clean Supabase reconstruction from migrations
- Navigation Integrity
- Persona Workspace Policy
- P0-P5 Revalidation
- AI Red Team Assurance and measured evidence
- CodeQL and dependency security
- Production Security Posture
- Release Governance
- V6 Operational Certification
- Production SLO and smoke testing

Two post-implementation verification gaps were discovered and fixed: the monitoring-domain dynamic route was absent from the canonical route contract, and the UX verifier still reflected the previous Job Monitor status implementation. These fixes were merged through PR #444.

## Production state

The revalidation fix merged to `main` at commit:

`364f49ee757de695efcafb610fe3dd51019c0128`

The resulting Vercel production deployment completed successfully. Production smoke checks confirmed unauthenticated requests to both `/api/monitoring/runs` and `/api/agent-approvals/requests` return `401 Authentication required`, the production job worker is healthy, and no runtime error clusters were present in the final validation window.

The production latency gate was not relaxed. Two runs temporarily exceeded the 1.5 second p95 requirement while still returning 50/50 successful responses with zero HTTP or transport failures. A subsequent unchanged-threshold rerun passed, so the release gate remained intact.

## Architectural conclusion

Agent Policy v2 is now implemented as a server-authoritative governance layer rather than a UI permission convention. Read/conversational access, execution authority, resource authorization, risk, approval separation, delegation, replay protection, notification delivery, and audit evidence all remain independently enforceable. The current production state is validated green, with the known secret-rotation operational risk managed separately from the implementation itself.
