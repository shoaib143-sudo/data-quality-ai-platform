# Persona verification progress and cleanup

Date: 2026-09-13

## Current verified production state

- 13 interactive persona test principals exist in Supabase Auth.
- All 13 are members of organization `c1b6736c-a8bc-4209-92ff-4d86b454d592` with organization role `MEMBER`.
- Each principal has exactly one active governance project-role binding.
- The active persona bindings currently target project `ab595892-828f-4585-bafb-b6c657585ce5` (`UI Regression Test Project`).
- All 13 persona landing-page settings are enabled for the organization.
- Senior Leadership has a confirmed historical successful password sign-in recorded at `2026-09-13 06:48:53.108131+00`.
- The other 12 principals remain structurally valid but have not yet produced literal `last_sign_in_at` evidence from this acceptance pass because browser automation blocks raw credential submission.

## Current production release

PR #390 consolidated the final authorization-hardening changes on current protected `main`.

Production merge SHA:

`6f794c3dcd2a42e05948b4aaaef89368115242d2`

Vercel production deployment:

`dpl_7dhRMttfsRKBVG57BaRjGDUQccy3`

The deployment is `READY`, targets production, matches the exact merge SHA, and owns the production alias.

The protected suite for the PR head passed, including:

- Quality Gate
- Persona Workspace Policy
- Privileged API Authorization Audit
- CodeQL Security
- P0-P5 Revalidation
- V6 Operational Certification
- clean-database reconstruction
- Production Security Posture
- Navigation Integrity
- Source Project Boundary
- AI governance/security boundary checks

## Persona acceptance fixes now in production

The deeper real-life persona audit found several gaps that were not visible in the earlier structural checks. The following are now fixed in production:

1. Shared governance workbenches use governed project context instead of blindly choosing the alphabetically first project when an authoritative project signal exists.
2. Reports and scorecards no longer silently show misleading zero-state evidence for an unrelated project.
3. Classification and Privacy project-scoped review context is explicit instead of mixing unrelated project evidence.
4. Governance Inbox and shared utility navigation no longer advertise inaccessible workspaces to the active persona.
5. Data Quality does not present runnable quality actions when no applicable enabled controls exist.
6. Schedule reads require explicit project scope and `schedule.manage`; page visibility alone is not treated as the API security boundary.
7. Classification handling-policy creation requires `policy.approve`, not merely `classification.review`.
8. Stewardship assignment/revocation controls require `stewardship.manage`.
9. Certification request controls require `certification.request`.
10. Certification decision controls require `certification.review`.
11. The Journeys experience distinguishes each persona's role-specific work from the platform's technical evidence lifecycle.

No role, persona, organization membership, RLS policy, or project privilege was widened to make tests pass.

## Temporary provisioning surface cleanup

The temporary provisioning API, admin page, provisioning contract script, and provisioning workflow have already been removed from production. The production route manifest and direct production probes previously confirmed the temporary routes are unavailable.

The 13 retained test Auth users and their governed role bindings remain intentionally available for regression and acceptance testing.

## Acceptance interpretation

A persona is considered structurally configured when all of the following are true:

1. Auth principal exists.
2. Organization role is `MEMBER`.
3. Exactly one active project-role binding exists.
4. Bound role key equals the expected persona role key.
5. Persona landing page is enabled.

All 13 satisfy these structural conditions.

A persona is not considered fully end-to-end accepted until there is concrete evidence for:

1. real password sign-in;
2. correct persona landing resolution;
3. positive access to the workspaces needed for the real-life role;
4. successful execution of applicable business tasks;
5. persisted evidence/audit state for controlled mutations;
6. expected denial of prohibited workspaces/actions;
7. no cross-project or cross-organization leakage;
8. no material UI/UX defect that prevents the role from completing the task.

## Literal browser-login status

Literal independent password login remains the primary unresolved acceptance gap.

- Senior Leadership has historical successful sign-in evidence.
- A new Senior Leadership browser run timed out while still working through the login form.
- A subsequent minimal login-only retry was blocked by the browser automation safety layer when raw credential submission was attempted.
- The other 12 principals therefore remain literal-login pending.

This must not be bypassed by direct password-hash changes, weaker Auth configuration, extra organization privilege, or fabricated acceptance evidence.

## Test-data limitation

The `UI Regression Test Project` is intentionally sparse and suitable for authorization regression, but not for realistic day-to-day persona workflows.

Richer governed evidence exists in projects such as `Profiling Demo Project`, including datasets, sources, glossary terms, classifications, lineage, issues and governance evidence. Real-life workflow verification should use existing governed evidence where read-only validation is sufficient, and controlled reversible test data for mutations.

An empty screen in the regression project is not by itself a successful real-life persona acceptance result.

## New runtime issue found after PR #390

Production runtime logs for the exact PR #390 deployment show intermittent failures while claiming durable jobs from workload pools:

`[job-pool-claim] CORE: Gateway Timeout`

`[job-pool-claim] SEMANTIC: Gateway Timeout`

These messages originate from `claimDurableJobs()` when the Supabase RPC `claim_jobs_by_pool` times out.

The request to `/api/jobs/worker` still returns 200 because the queue implementation:

- records the failed pool claim;
- leaves jobs queued for retry;
- records telemetry;
- continues attempting the remaining configured workload pools;
- fails the worker only if all configured workload pools fail.

This is a production orchestration resilience/performance issue. It is not evidence of a persona authorization regression, but it can affect operational personas if job execution is delayed and therefore remains an open technical item.

## Stale PR cleanup

The independent hardening PRs are superseded by merged PR #390 and have been closed:

- #385 classification policy authority
- #388 Stewardship capability visibility
- #389 schedule authorization refresh

PR #363 is unrelated Living Tree monitoring work and remains open/draft under its own acceptance criteria.

## Remaining acceptance work

The following remain open:

1. literal login verification for the remaining persona principals;
2. complete positive and negative authorization matrix for all 13 personas;
3. real-life read workflows on meaningful governed data;
4. controlled mutation tests for issue lifecycle, certification, classification/policy decisions and other role-specific actions;
5. before/after persisted evidence verification for those mutations;
6. final UI/UX sweep after all production fixes;
7. investigation and remediation of the intermittent CORE/SEMANTIC job-pool claim timeouts;
8. final persona acceptance matrix and release handover.

## Safety boundaries retained

- Data Governance Admin persona is not mapped to organization `ADMIN`.
- Existing machine/service identities are not converted into password users.
- Passwords are not committed to GitHub or persisted in governance tables.
- No RLS policy or organization privilege was weakened for testing.
- API authorization remains authoritative even when UI controls are hidden.
