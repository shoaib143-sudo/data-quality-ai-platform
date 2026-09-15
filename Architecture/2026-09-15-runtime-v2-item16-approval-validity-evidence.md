# Runtime v2 Item 16 — Approval Validity Evidence

Date: 2026-09-15

## Status

`VALIDATED` pending documentation PR merge. Runtime implementation is merged to `main` in PR #463 (`10f25bff2ba09bcb07d95caea019655a9bbfc280`) and the forward-only production migration has been applied to Supabase project `tvjnavjxuehpesxcfvrx`.

## Frozen policy implemented

- Approval validity is configurable per project.
- Default approval validity is 7 days.
- The validity window begins at the final human approval timestamp (`approved_at`).
- Human-approved requests fail closed when expiry evidence is missing or expired.
- Expired executable requests are invalidated before execution with an explicit invalidation reason.
- Material execution-fingerprint changes continue to invalidate approvals independently of expiry.
- Existing action binding, resource ACL revalidation, and capability checks remain in the execution gate.

## Schema and runtime changes

Migration `20260915090000_agent_approval_validity_expiry.sql` adds:

- `governance.project_agent_policy_context.approval_validity_days integer not null default 7` with a positive-value constraint;
- `governance.agent_approval_requests.approval_expires_at timestamptz`;
- `governance.apply_agent_approval_expiry()` as a SECURITY DEFINER trigger function with pinned `search_path = pg_catalog, governance`;
- trigger `trg_apply_agent_approval_expiry` to derive expiry when a human-approved request becomes `READY_TO_EXECUTE`;
- a forward-only backfill for existing executable human-approved requests;
- partial index `idx_agent_approval_requests_ready_expiry` for executable expiry inspection.

`lib/governance/agent-approval-service.ts` validates the persisted expiry before fingerprint and execution authorization. Only executable human-approved requests are expiry-invalidated, so rejected or otherwise non-executable requests are not rewritten merely because they have no expiry evidence.

## Validation evidence

Exact-head PR #463 validation completed successfully, including:

- Agent Approval Validity dedicated contract;
- Quality Gate;
- P0-P5 Revalidation;
- CodeQL Security;
- Production Security Posture;
- AI Production Boundaries;
- V6 Operational Certification;
- clean database reconstruction;
- runtime SLO;
- dependency/security and governance contract suites.

Production validation after merge:

- Vercel production deployment for merge `10f25bff2ba09bcb07d95caea019655a9bbfc280` reached `READY`;
- production runtime error/fatal scan returned no errors for the deployment window;
- unauthenticated `/api/agent-approvals/requests` continues to fail closed with HTTP 401;
- live Supabase verification confirmed `approval_validity_days` default `7`, positive-value check, `approval_expires_at`, trigger installation, pinned function search path, and zero `READY_TO_EXECUTE` human-approved requests with missing expiry.

## Result

Runtime v2 line item 16 approval validity is implemented and production-validated. Further approval/runtime work may extend administration surfaces or reporting, but the frozen 7-day-default expiry and pre-execution fail-closed contract are now enforced.
