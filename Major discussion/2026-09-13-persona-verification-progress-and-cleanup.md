# Persona verification progress and cleanup

Date: 2026-09-13

## Current verified production state

- 13 interactive persona test principals exist in Supabase Auth.
- All 13 are members of organization `c1b6736c-a8bc-4209-92ff-4d86b454d592` with organization role `MEMBER`.
- Each principal has exactly one active governance project-role binding.
- The active persona bindings currently target project `ab595892-828f-4585-bafb-b6c657585ce5` (`UI Regression Test Project`).
- All 13 persona landing-page settings are enabled for the organization.
- Senior Leadership has a confirmed successful password sign-in recorded at `2026-09-13 06:48:53.108131+00`.
- The other 12 principals remain structurally valid but have not yet produced `last_sign_in_at` evidence because the available browser/network automation paths block raw credential submission.

## Production release evidence

Production is currently serving merge commit `dba2a54becf21cb6b779276688e2b72e1edbd1ed` from PR #377. The deployment is `READY` in Vercel. Relevant CI for the PR head completed successfully, including Quality Gate, Persona Workspace Policy, Privileged API Authorization Audit, CodeQL Security, V6 Operational Certification, and the temporary persona provisioning contract.

Recent runtime evidence for that exact production deployment contained no error/fatal log entries. Observed HTTP status activity included successful requests plus isolated 403 and 405 responses consistent with authorization and method protection.

## Temporary provisioning surface cleanup

The persona provisioning route, admin page, dedicated provisioning contract script, and dedicated provisioning workflow were intentionally temporary. A cleanup branch based on the latest hardened `main` removes all four artifacts together:

- `app/api/admin/persona-test-principals/route.ts`
- `app/admin/persona-test-principals/page.tsx`
- `scripts/test-persona-test-principal-provisioning.mjs`
- `.github/workflows/persona-test-principal-provisioning.yml`

This cleanup must be merged through the normal protected-branch process. The 13 existing Auth principals and their governance bindings are not deleted by this code cleanup.

## Acceptance interpretation

A persona is considered structurally configured when all of the following are true:

1. Auth principal exists.
2. Organization role is `MEMBER`.
3. Exactly one active project-role binding exists.
4. Bound role key equals the expected persona role key.
5. Persona landing page is enabled.

All 13 currently satisfy these structural conditions.

Literal end-to-end password-login acceptance remains complete only for Senior Leadership. The remaining 12 should not be marked as literal-login PASS until an actual password sign-in is observed for each principal.

## Safety boundaries retained

- Data Governance Admin persona is not mapped to organization `ADMIN`.
- Existing machine/service identities are not converted into password users.
- Passwords are not committed to GitHub or persisted in governance tables.
- No RLS policy or organization privilege was weakened for testing.
- Temporary privileged provisioning code is being removed after provisioning.
