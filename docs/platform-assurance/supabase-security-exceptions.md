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


## 2026-10-20 live review

A fresh Supabase security-advisor and database-policy review was completed after the governed-learning release migrations.

- `agent.agent_run_runtime_manifests`: the former no-policy advisor exception is closed. The live table now has restrictive policy `deny_direct_client_access` for `authenticated` and `anon`, with `USING (false)`; authenticated SELECT/INSERT/UPDATE/DELETE privileges remain absent.
- Membership helper functions `app_private.is_org_member`, `is_org_admin`, `is_project_member`, and `is_project_admin`: the advisor still reports them as authenticated-callable `SECURITY DEFINER` functions. The existing accepted exception remains in force and is renewed through 2026-11-19; no authority expansion was observed.
- `agent.resolve_runtime_interrupt`: the advisor still reports this governed human-decision RPC as authenticated-callable `SECURITY DEFINER`. The existing accepted exception remains in force and is renewed through 2026-11-19; the authorization boundary remains intentionally reviewed on change.
- Leaked-password protection: the advisor still reports the control as disabled. The gap remains open and is renewed for review through 2026-11-19; it is not represented as remediated.
- `agent.negative_learning_case_occurrences`: the post-release learning table now has an explicit restrictive authenticated deny policy with `USING (false)`, preserving service-role-only evidence access and removing the module-specific no-policy advisor finding.

This review renews only the documented exceptions that remain observable. It does not convert warnings or plan-constrained gaps into passing controls.
