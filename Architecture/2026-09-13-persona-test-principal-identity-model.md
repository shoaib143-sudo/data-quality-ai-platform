# Persona test principal identity model

Status: provisional until production provisioning and end-to-end verification complete.

## Decision

DataNexus persona acceptance testing uses dedicated interactive test principals. Machine service identities are not converted into password-login users.

Each test principal has four independent layers:

1. Supabase Auth identity for authentication.
2. app.organization_members row with MEMBER tenancy only.
3. governance.project_role_bindings row with exactly one active finalized persona role on the target project.
4. Persona-aware application resolution to /home/<persona> and the corresponding workspace/navigation policy.

Organization privilege and governance persona remain separate dimensions. DATA_GOVERNANCE_ADMIN does not imply organization ADMIN. No test principal receives OWNER or ADMIN merely to make acceptance tests pass.

## Credential handling

Passwords are generated with cryptographically secure randomness by a temporary server-side route. Plaintext credentials are returned only to the authenticated organization OWNER making the explicit provisioning request. Responses use no-store cache controls. Passwords are never written to application tables, governance audit metadata, repository files, or logs.

Synthetic email identifiers under datanexus.test are acceptable for controlled interactive acceptance testing because the accounts are created administratively with email confirmation set. These identifiers must not be treated as real mailboxes or enterprise identities.

## Provisioning invariants

Provisioning must be idempotent. Re-running rotates credentials, preserves each Auth user identity, keeps organization membership at MEMBER, deactivates conflicting active persona bindings for the test user across the organization, and leaves exactly one active target persona binding on the selected project.

Every provisioning action writes a governance audit event containing user ID, synthetic email identifier, persona slug, role key, binding ID, and rotation timestamp. Passwords are explicitly excluded.

## Verification contract

A persona is not considered verified merely because its role binding exists. Verification requires a real email/password sign-in through the DataNexus login page, correct persona landing resolution, expected positive workflow access, expected negative authorization behavior, and no cross-project or cross-organization leakage.

## Cleanup

The temporary provisioning API and temporary execution page must be removed after credentials are captured and acceptance testing no longer needs credential rotation. The 13 test Auth users and governed role bindings may remain if they are intentionally retained for regression testing, but their purpose must remain explicit and their passwords should be rotated when reused.
