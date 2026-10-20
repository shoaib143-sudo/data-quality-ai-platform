# Supabase security advisor decisions

This record distinguishes advisor-visible conditions from unresolved exploitable gaps. It must be revalidated against the live project after any DDL, grant, RLS, Auth, or privileged-function change.

## `agent.agent_run_runtime_manifests` — RLS enabled with no policy

**Decision: ACCEPTED LOCKED-TABLE POSTURE.**

Live validation on 2026-09-12 showed RLS enabled, zero policies, and zero `authenticated` SELECT/INSERT/UPDATE/DELETE privileges. No client access is intended; service-side privileged code owns runtime manifest persistence. A policy must not be added merely to silence an informational advisor because that would broaden access. Any future authenticated grant requires an explicit project-scoped RLS policy and adversarial authorization tests.

## `app_private.is_org_member`, `is_org_admin`, `is_project_member`, `is_project_admin`

**Decision: INTENTIONAL PRIVILEGED AUTHORIZATION HELPERS; REVIEW REQUIRED ON CHANGE.**

These functions are `SECURITY DEFINER` with an empty `search_path`. Their result is derived from `auth.uid()` and canonical `app.organization_members` / `app.projects` rows. They exist to support RLS and authorization predicates without exposing membership table internals. `anon` execution is not permitted. Because the advisor correctly flags authenticated-callable definer functions as high sensitivity, the baseline verifier pins their required security properties rather than dismissing the warning generically.

## `agent.resolve_runtime_interrupt`

**Decision: INTENTIONAL GOVERNED HUMAN-DECISION RPC; REVIEW REQUIRED ON CHANGE.**

The RPC is authenticated-callable because it is the human approval/rejection boundary for a pending runtime interrupt. It validates `auth.uid()`, project-administrator authority, decision allowlist, interrupt pending state, expiry, and the pending action payload hash. The 2026-09-12 timeout lifecycle adds audited late-decision rejection. Timeout and cancellation automation functions remain service-role only. Any removal of these checks or expansion beyond approval/rejection is a release blocker.

## Leaked password protection

**Decision: OPEN PLAN-CONSTRAINED SECURITY GAP.**

Supabase leaked-password protection is available on Pro plans and above. The current project posture is Free, so this control cannot be enabled without a plan change. DataNexus must not report this as remediated. Compensating controls are strong password requirements where available, short/safe session handling, MFA/passkey evaluation, monitoring, and a tracked upgrade decision before higher-risk production use. This is not a database migration gap.

## Production schema drift found during baseline

The baseline audit found protected `main` contained the governed native interrupt-timeout migration while production Supabase had not applied it. The exact signed-main migration was applied on 2026-09-12 and verified: the append-only interrupt event ledger exists, timeout/cancel RPCs are service-role only, authenticated execution is denied, and human resolution contains the late-decision audit path.


## Review renewal — 2026-10-20

Residual risks were re-reviewed against protected-main commit `f78c9d7c2218245df810024f87ef713dd58fbc7f` after the previous 2026-10-12 review deadline expired.

Fresh exact-head evidence reviewed:
- Supabase Advisor Hardening — PASS, run 39365109348.
- Authenticated SECURITY DEFINER Allowlist — PASS, run 39365109183.
- Production Security Posture — PASS, run 39365109360.
- AI Production Boundaries — PASS, run 39365109162.
- Source Project Boundary — PASS, run 39365109325.
- Autonomous Agent Governance — PASS, run 39365109310.

Decisions:
- PA-RISK-001 — renewed as an accepted R2 exception. The locked-table posture remains intentional; no client CRUD grant or permissive RLS policy is introduced.
- PA-RISK-002 — renewed as an accepted R3 exception. Current exact-head SECURITY DEFINER and authorization controls remain green.
- PA-RISK-003 — renewed as an accepted R3 exception. The governed human-decision RPC remains bounded by authorization, payload validation, timeout/cancellation, and fail-closed behavior.
- PA-RISK-004 — remains OPEN_GAP. No exception is granted. Leaked-password protection remains unavailable on the current plan and must not be represented as remediated.

Next review due: 2026-11-19, or earlier on any material DDL, grant, RLS, Auth, privileged-function, or plan change.
