# Production security and certification continuation

Date: 2026-09-15
Status: Active continuation record

## Scope

This continuation record captures the current production security and certification boundaries after the September hardening cycle. Existing ADRs remain authoritative. This document records implementation state and continuation constraints without redesigning established architecture.

## Privileged database execution boundary

SECURITY DEFINER functions are treated as privileged interfaces. Browser role execution is denied by default and must be explicitly allowlisted when required by an authenticated application path.

The production verifier is expected to fail when any unexpected authenticated SECURITY DEFINER function appears, when anonymous access reaches membership helpers, when privileged helper search paths are unsafe, or when runtime interrupt authorization is not guarded.

Historical clean reconstruction may require replay only ACL reconciliation when old migration state differs from the verified current production privilege boundary. Such reconciliation belongs in disposable reconstruction preparation. It must not broaden production grants or rewrite historical migrations.

## Restricted search_path rule

Privileged functions should retain restricted search_path configuration. Extension functions used from those paths must be schema qualified, for example `extensions.digest(...)`, rather than solved by widening search_path. This preserves deterministic resolution and reduces privilege confusion risk.

## Certification boundary

Code is not complete merely because implementation exists. Release readiness requires relevant positive and negative tests, exact head CI, security and policy checks, reconstruction or recovery validation where applicable, preview validation where applicable, and post merge production validation for production affecting changes.

Required checks must not be bypassed merely because equivalent workflows appear green. Repository rule evaluation is part of the release boundary.

## GitHub Actions supply chain continuation

The repository already enforces immutable action reference pinning and least privilege workflow permissions. The next hardening step is deterministic inventory of all action dependencies before restricting the repository level Actions allowlist. Restriction must be based on evidence so required CI and deployment workflows are not accidentally disabled.

PR #512 implements the inventory preparation. It must merge only after its exact head certification completes successfully.

## External authorization boundary

Account level controls that require personal or provider administration authority remain BLOCKED_EXTERNAL when the connected execution context lacks that authority. Application code must not compensate by weakening local controls.

The known remaining example is leaked password protection in Supabase Auth.

## Continuation rules

1. Preserve existing schema ownership and migration boundaries.
2. Prefer forward only migrations and reversible configuration changes.
3. Keep replay fixtures and production policy separate.
4. Stop repeated CI or connector retries when the failure class is unchanged and no new evidence is gained.
5. Merge and deploy only on an exact validated head.
6. Revalidate production after production affecting merges.
