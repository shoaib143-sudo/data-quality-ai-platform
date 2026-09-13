# Persona test principal identity model

Status: implemented and structurally verified in production; literal password-login verification remains complete only for Senior Leadership as of 2026-09-13.

## Decision

DataNexus persona acceptance testing uses dedicated interactive test principals. Machine service identities are not converted into password-login users.

Each test principal has four independent layers:

1. Supabase Auth identity for authentication.
2. app.organization_members row with MEMBER tenancy only.
3. governance.project_role_bindings row with exactly one active finalized persona role on the target project.
4. Persona-aware application resolution to /home/<persona> and the corresponding workspace/navigation policy.

Organization privilege and governance persona remain separate dimensions. DATA_GOVERNANCE_ADMIN does not imply organization ADMIN. No test principal receives OWNER or ADMIN merely to make acceptance tests pass.

## Credential handling

Passwords were generated with cryptographically secure randomness by a temporary server-side route. Plaintext credentials were returned only to the authenticated organization OWNER making the explicit provisioning request. Responses used no-store cache controls. Passwords were never written to application tables, governance audit metadata, repository files, or logs.

Synthetic email identifiers under datanexus.test are acceptable for controlled interactive acceptance testing because the accounts are created administratively with email confirmation set. These identifiers must not be treated as real mailboxes or enterprise identities.

## Provisioning invariants

Provisioning is idempotent. Re-running rotates credentials, preserves each Auth user identity, keeps organization membership at MEMBER, deactivates conflicting active persona bindings for the test user across the organization, and leaves exactly one active target persona binding on the selected project.

Every provisioning action writes a governance audit event containing user ID, synthetic email identifier, persona slug, role key, binding ID, and rotation timestamp. Passwords are explicitly excluded.

## Verified production state

As of 2026-09-13, all 13 persona principals exist in Supabase Auth and all 13 are members of organization `c1b6736c-a8bc-4209-92ff-4d86b454d592` with organization role `MEMBER`.

Each principal has exactly one active governance persona binding. The active bindings currently target project `ab595892-828f-4585-bafb-b6c657585ce5`, named `UI Regression Test Project`. All 13 persona landing-page settings are enabled for the organization.

The live structural acceptance query confirms all 13 satisfy:

1. Auth principal exists.
2. Organization role is MEMBER.
3. Exactly one active project-role binding exists.
4. Active role key equals the expected persona role key.
5. Persona landing-page setting is enabled.

Senior Leadership additionally has a confirmed successful password sign-in recorded in Supabase Auth at `2026-09-13 06:48:53.108131+00`.

The remaining 12 principals have not yet produced literal password sign-in evidence. Available automation paths reject raw credential submission, so those 12 must remain marked as structurally verified but literal-login pending. This limitation must not be papered over by granting extra privilege, weakening authentication, or directly manipulating Auth password hashes.

## Verification contract

A persona is not considered fully end-to-end verified merely because its role binding exists. Full verification requires a real email/password sign-in through the DataNexus login page, correct persona landing resolution, expected positive workflow access, expected negative authorization behavior, and no cross-project or cross-organization leakage.

Structural verification and literal-login verification are therefore reported separately.

## Production release evidence

The hardened temporary provisioning implementation was merged through PR #377 and deployed in Vercel production at merge commit `dba2a54becf21cb6b779276688e2b72e1edbd1ed`.

The PR head passed the relevant CI suite, including Quality Gate, Persona Workspace Policy, Privileged API Authorization Audit, CodeQL Security, V6 Operational Certification, and the dedicated persona provisioning contract. The exact production deployment is `READY` and recent runtime evidence contained no error or fatal log entries.

## Cleanup

The temporary provisioning API, temporary admin execution page, dedicated provisioning contract script, and dedicated provisioning workflow are all intentionally removed together after credentials were captured and account structure was verified.

The 13 test Auth users and governed role bindings remain because they are retained for regression and acceptance testing. Their purpose must remain explicit and their passwords should be rotated when reused.

Removing the temporary provisioning code does not delete or weaken the test principals, tenancy membership, persona bindings, landing settings, or governance authorization model.
