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

The temporary persona provisioning implementation was hardened through PR #377 and subsequently removed through the protected cleanup release. The current persona-authorization hardening release is PR #390, merged to `main` at `6f794c3dcd2a42e05948b4aaaef89368115242d2`.

Vercel production deployment `dpl_7dhRMttfsRKBVG57BaRjGDUQccy3` is `READY`, targets production, matches the exact merge SHA, and owns the production alias.

The exact PR #390 head passed the relevant protected suite, including Quality Gate, Persona Workspace Policy, Privileged API Authorization Audit, CodeQL Security, P0-P5 Revalidation, Production Security Posture, Navigation Integrity, Source Project Boundary, AI boundary checks, and V6 Operational Certification including clean database reconstruction.

## Authorization hardening completed during persona acceptance

Persona acceptance uncovered and corrected several gaps that route-only verification had missed:

1. Shared workbenches no longer silently default role-bound users to an unrelated alphabetically first project.
2. Shared navigation and Governance Inbox no longer advertise workspaces unavailable to the resolved persona.
3. Data Quality no longer presents executable rule actions when no applicable enabled controls exist.
4. Schedules read access now requires explicit project scope plus `schedule.manage`.
5. Classification handling-policy creation now requires the distinct `policy.approve` authority rather than the weaker `classification.review` capability.
6. Stewardship assignment/revocation, certification request, and certification review controls are rendered only when the selected project grants the exact matching capability.
7. The Journeys workspace now distinguishes role-specific work from the technical platform evidence lifecycle.

These fixes narrow or clarify authorization. They do not widen any persona, project role, organization privilege, or RLS boundary.

## Functional acceptance limits

The 13 principals are structurally valid, but full day-to-day persona acceptance is not yet complete.

The main remaining limitation is literal browser authentication. Senior Leadership has historical successful sign-in evidence. A new browser acceptance run timed out while interacting with the login form, and a shorter retry was blocked by the browser automation safety layer when raw password submission was attempted. Therefore the remaining 12 principals must remain marked literal-login pending, and the new Senior Leadership run must not be counted as a fresh end-to-end pass.

The active regression-binding project is intentionally sparse and is suitable for authorization regression, not realistic business-task verification. Richer read-only workflow evidence exists in governed projects such as Profiling Demo Project. Functional acceptance must continue to distinguish authorization regression from realistic business workflow coverage.

## Runtime finding discovered during final verification

Current production runtime logs show intermittent Supabase RPC timeouts while the worker claims durable jobs from CORE and SEMANTIC workload pools:

`[job-pool-claim] CORE: Gateway Timeout`

`[job-pool-claim] SEMANTIC: Gateway Timeout`

The worker request itself returns HTTP 200 because the queue implementation treats a single-pool claim failure as degraded operation, leaves that pool queued for retry, records telemetry, and continues other workload pools. This is an orchestration resilience/performance issue and must not be misclassified as a persona authorization failure.

## Cleanup

The temporary provisioning API, temporary admin execution page, dedicated provisioning contract script, and dedicated provisioning workflow were removed after credentials were captured and account structure was verified.

The 13 test Auth users and governed role bindings remain because they are retained for regression and acceptance testing. Their purpose must remain explicit and their passwords should be rotated when reused.

Removing the temporary provisioning code does not delete or weaken the test principals, tenancy membership, persona bindings, landing settings, or governance authorization model.
