# Governance Admin MFA: staged rollout (Issue #1149)

This PR introduces a fail-closed assurance decision and a server-side guard, **not enforcement**. No privileged route calls the guard yet. It must not be represented as production MFA protection.

## Workstream 1: authorization inventory
Enumerate every privileged Data Governance Admin route, server action, RPC and runtime persona switch. Require trusted server-side role and tenant checks before invoking `requireGovernanceAdminMfa()`. Service-to-service jobs require distinct workload authorization, never interactive session MFA bypass.

## Workstream 2: enrollment and recovery
Implement Supabase TOTP enrollment, challenge, verification and factor lifecycle. Test at least one real administrator enrollment and an audited break-glass recovery process before enabling enforcement. Preserve password-reset flow.

## Workstream 3: adversarial verification
Test AAL1 and unknown-level denial, forged user metadata, stale JWT, cross-tenant scope, direct API calls, persona switching, disabled factors, expired challenges, recovery and administrator lockout. Verify guards cannot be bypassed through RPCs or alternate endpoints.

## Workstream 4: closure
Run exact-head CI and negative/integration tests, independent security audit, review Supabase security advisors, archive evidence and obtain authorized residual-risk acceptance. PA-RISK-004 remains OPEN: Supabase Free does not support built-in breached-password protection. Do not upgrade or claim remediation.

## Deployment gate
Do not wire guard into production endpoints until enrollment, recovery and compatibility checks are complete. No automatic merge or deployment is authorized by this staged foundation.
