# Learning runner identity and independent review trust contract

Date: 2026-10-03  
Status: implementation specification, not an applied migration  
Scope: current authority and independent evaluator identity for governed learning experiments

## Decision

Do not implement a production authority resolver until the policy actor fields and evaluator assignment have canonical identity and attestation. The current policy table stores `evaluator_actor_id` and `proposer_actor_id` as unconstrained text. Its only identity constraint is that they differ. The registration RPC is executable only by `service_role`, accepts both actor strings as arguments, and does not bind either value to an authenticated caller or current project capability. `executeStoredLearningExperiment` accepts an injected `authorize(plan)` callback and does not derive an authenticated actor. Consequently, different text values do not establish distinct people, current authority, or independence.

This specification defines the contract needed before that adapter can return `independenceVerified: true`. It does not enable runs, apply schema changes, create evaluator accounts, or grant capabilities.

## Repository evidence and exact gaps

| Area | Current evidence | Required change |
| --- | --- | --- |
| Identity storage | `agent.learning_evaluation_policies.evaluator_actor_id` and `proposer_actor_id` are `text NOT NULL`; no `auth.users` foreign keys or UUID checks | Persist canonical `uuid` user IDs with restrictive foreign keys |
| Registration | `registerLearningEvaluationPolicy` passes policy-provided actor strings to the service-only `record_learning_evaluation_policy` RPC | Obtain proposer from the authenticated server session; never accept proposer identity from request JSON |
| Current authority | `authorizeProject(userId, projectId, capability)` resolves live project capability; `hasProjectCapability` supports `agent.execute`, `policy.approve`, and related capabilities | Recheck capabilities for the exact project, candidate, policy and run at execution and evaluation time |
| Runner seam | `executeStoredLearningExperiment` receives `authorize` as an injected port | Replace arbitrary caller injection with a server-owned resolver composed from trusted database reads and the existing auth helper |
| Independence | Policy constraint only enforces `evaluator_actor_id <> proposer_actor_id` | Bind a distinct evaluator assignment and signed/immutable attestation record to the locked policy scope |
| Evaluation evidence | Scoring accepts a loader-issued `independentVerification` object with evaluator, rubric, calibration, hashes and exhaustive-attempt assertions | Issue that receipt only after canonical persisted evidence and live evaluator authority have been verified |

Relevant source: `supabase/migrations/20260930123000_governed_learning_evaluation_release_admission.sql`, `lib/agents/governed-learning-evaluation-service.ts`, `lib/agents/learning-experiment-runner-service.ts`, `lib/agents/learning-experiment-runner.ts`, `lib/agents/learning-experiment-runner-scoring.ts`, and `lib/auth/authorize.ts`.

## Trust contract

### 1. Authenticated proposer

1. The API entry point authenticates through the repository's server Supabase client and obtains `user.id` from `auth.getUser()`. Do not trust a body, query, cookie outside the validated session, or service caller field for `proposerUserId`.
2. The route loads the candidate and project from canonical storage. Caller-supplied project, candidate, agent, skill, mode and version values are selectors only; the persisted rows determine the authoritative tuple.
3. Before locking a policy, the route calls `authorizeProject(user.id, projectId, 'agent.execute')`. If policy creation requires administrative control, use the separately selected capability and document that choice. Do not silently substitute broader `agent.admin` authority.
4. The server passes the authenticated UUID to a narrow service function. The service validates canonical UUID format, exact project/candidate/policy relationships and immutable policy contents. The proposer UUID is written from this authenticated identity, not from the client payload.
5. Policy registration remains server-only. Browser roles retain read-only project-scoped policy access. The service credential is never exposed to clients.

### 2. Evaluator assignment and independence attestation

1. The evaluator is an existing `auth.users.id`, stored as UUID and linked by a restrictive FK. The evaluator must differ from the authenticated proposer.
2. The policy lock records an immutable reviewer assignment bound to `(project_id, policy_record_id, candidate_id, policy_key, manifest_hash, rubric_ref, calibration_ref, proposer_user_id, evaluator_user_id)`.
3. The evaluator assignment is a persisted attestation with the authenticated assigner's UUID, assignment time, reviewer acknowledgement or approval event, and the exact scope digest. An unverified text field, caller boolean, role name, or two different strings is not an attestation.
4. The assignment creator must have the project-scoped authority chosen for evaluation assignment. The evaluator must hold the chosen current evaluation capability. Use existing `policy.approve` only if product governance explicitly treats it as the evaluator capability; otherwise add a narrow `agent.learning.evaluate` capability consistently to the authorization type, role catalog, database capability checker and admin UX. Do not infer evaluator eligibility from `agent.view`.
5. If proposer and evaluator share an account, delegated identity, service principal, or another prohibited conflict, fail closed. The policy must identify which conflict checks are authoritative. At minimum, reject identical canonical UUIDs and self-review. Any additional organizational separation rule must use a canonical identity/relationship source, not email text.
6. `independenceVerified: true` is allowed only after a trusted loader verifies the immutable assignment/attestation row, exact scope digest, distinct UUIDs, current project capability for both roles, non-revoked identities, approved evaluator state, and no conflict finding. Any missing, stale, ambiguous, or unavailable source returns false or denies authorization.
7. This execution-authority attestation only establishes that the evaluator was assigned independently. It does not mean the candidate improved. A separate evaluation receipt may set `independentlyVerified` only after the evaluator reviewed canonical outputs and the loader verified all attempts, artifact hashes, rubric, calibration, accounting, and denominator.

### 3. Current-authority resolution

The resolver is server-only and accepts the requested `runId` as its only untrusted selector. It loads and verifies the plan itself, then:

- requires UUIDs for run, project, policy record, candidate, proposer and evaluator;
- requires exact row links for project, policy record, logical policy key, candidate, agent, skill, mode, baseline/candidate versions and manifest;
- authorizes the proposer for the current project capability required to dispatch, using the existing `authorizeProject` / `hasProjectCapability` helpers;
- revalidates the assigned evaluator's current evaluation capability before dispatch and again before evaluation write;
- checks evaluator assignment and attestation against exact policy and manifest scope, rather than accepting fields from the plan;
- verifies the source-remediation boundary remains false and never infers remediation authority from learning-run permission;
- fails closed on an unavailable auth service, missing role binding, ambiguous assignment, policy mutation attempt, or mismatched scope;
- returns only a typed decision and attestation references, never service-role credentials or raw secrets.

The runner should receive a server-composed authorization adapter, not an arbitrary route-supplied callback. Its authorization result must not be constructible from request values alone. Recheck immediately before every dispatch, as the runner already does for its injected port.

Suggested typed receipt, subject to implementation review:

```ts
type LearningRunnerAuthorityReceipt = {
  projectId: string
  policyRecordId: string
  candidateId: string
  runId: string
  proposerUserId: string
  evaluatorUserId: string
  executeAllowed: true
  evaluatorAllowed: true
  independenceVerified: true
  assignmentAttestationId: string
  assignmentScopeHash: string
  sourceRemediationAllowed: false
}
```

Only the trusted resolver may construct the success variant. Represent denial separately, or throw a stable denial error. Do not accept a caller-created receipt as evidence.

## Database and API implementation requirements

### Migration

1. Add UUID identity columns or replace the text columns with UUID references. Use `references auth.users(id) on delete restrict` for proposer and evaluator. Keep evaluator distinctness as a UUID constraint.
2. Add an immutable reviewer-assignment/attestation table linked by `(policy_id, project_id)` to the exact policy and by UUID FKs to users. Include candidate, evaluator, proposer, scope digest, attester, attested timestamp, decision/status and revocation/supersession linkage as required by the existing append-only pattern.
3. Do not cast legacy text blindly. Backfill only values that parse as UUID and resolve to actual `auth.users` rows. Leave invalid/unmapped rows explicitly blocked for a reviewed data migration. Do not create synthetic UUIDs or treat old string inequality as proof.
4. Require UUID fields and a valid assignment attestation before a policy can be used for dispatch. Preserve append-only/immutability, RLS, scoped read, function grants and service-role boundaries. Browser roles must not insert or update identity/attestation rows.
5. Update the policy registration and assignment RPC signatures so the authenticated entry point's proposer cannot be substituted by request data. Add in-function exact project/candidate/manifest checks and current capability checks where the database has a trustworthy actor context. If the existing service-role RPC pattern is retained, document the server-only trust boundary and prove no browser role can execute it.
6. Add database checks that bind the evaluator assignment to the immutable policy row and reject a different project, candidate, manifest, rubric or calibration. Use transaction-level atomicity for policy lock and assignment creation.

### API and server composition

- Add an authenticated policy registration/assignment entry point only after the migration and authority policy are agreed in code. It derives the actor from the server session and ignores any client-supplied actor ID.
- The route must authorize the canonical project before any write, then use a server-only service that re-reads canonical candidate and policy context. Return no service-role data beyond the user-authorized response.
- Replace free-form `authorize` injection in production composition with the server-owned authority resolver. Retain dependency injection only in unit tests or behind a non-exported composition boundary.
- Persist assignment and evaluation attestations atomically with their audit records. A resolver read failure must block dispatch; an evaluation receipt failure must block scoring/release admission.
- Continue to keep automatic promotion disabled. This contract authorizes bounded experiment dispatch and trusted evaluation only. Candidate activation remains a separate governed approval path.

## Required tests before implementation is accepted

### Unit tests for the pure decision layer

- valid exact-scope authority and independent assignment;
- proposer and evaluator equal after UUID normalization;
- malformed UUID, arbitrary text, null, blank and mixed-case UUID parsing behavior;
- mismatched project, policy row ID, candidate, run, mode, version or manifest digest;
- missing, expired, revoked, superseded, ambiguous or duplicate assignment attestation;
- missing evaluator capability, missing proposer dispatch capability, and capability revoked between plan load and recheck;
- assignment scope digest mismatch or stale rubric/calibration reference;
- source-remediation capability accidentally true;
- identity/provider lookup errors return a denial and never a permissive default.

### API/service tests

- authenticated user A becomes proposer even if the body claims user B;
- unauthenticated request receives 401 and creates no policy/assignment row;
- authenticated user without project capability receives 403 and creates no rows;
- caller cannot assign themselves as evaluator;
- caller cannot substitute project or candidate across tenants;
- service method rejects actor IDs that were not derived from authenticated context;
- current authority is checked again before each arm dispatch;
- evaluator assignment may not be rewritten after policy lock; changed evaluator requires a new policy/attestation version, leaving prior evidence intact;
- evidence and authority loader returns only exact policy/project/candidate scope and stops on duplicate rows or query errors.

### SQL and privilege tests

- invalid/nonexistent user UUIDs fail FK constraints;
- identical proposer/evaluator UUIDs fail;
- arbitrary legacy strings cannot pass the new dispatch eligibility path;
- project/candidate/policy/manifest cross-links fail even when each ID exists separately;
- anonymous and authenticated roles cannot write policy identity or reviewer attestation rows or execute service-only RPCs;
- direct service RPC calls with spoofed actor IDs are denied or are only callable through the explicitly documented trusted server boundary;
- append-only triggers reject updates/deletes to policy and attestation evidence;
- concurrent assignment/lock attempts produce one unambiguous immutable assignment;
- migration on a disposable database safely blocks invalid legacy data and rolls back atomically on required backfill failure.

### Failure and adversarial tests

- auth provider outage, database timeout, capability-check error, and partial RPC commit all stop with no dispatch;
- reviewer account deletion/disablement, role expiry, revocation, or project transfer between plan preparation and dispatch stops the next attempt;
- forged `independenceVerified: true`, forged attestation ID, caller-supplied reviewer receipt, and client `proposerUserId` are ignored or rejected;
- evaluator is authorized at assignment but unauthorized at review time;
- resolver sees two conflicting assignment rows or changed digest and refuses to choose one;
- proposer/evaluator aliases or delegated principals are rejected if a canonical conflict source identifies them;
- current authorization passes for project A while a plan references project B, candidate B, or policy B; assert zero provider calls;
- attempted source remediation remains denied even with valid learning-run authority;
- persisted evaluation can never be marked independently verified based only on distinct IDs or an input boolean.

Every negative case must assert zero dispatch, no prospective evidence writes, no candidate activation, and no positive learning claim. Preserve safe audit evidence for the denial where available.

## Implementation sequence and completion gates

1. Confirm which existing capability governs evaluator assignment/review, or add the narrow `agent.learning.evaluate` capability. This is the only unresolved policy choice in this contract.
2. Inspect current policy rows in a read-only migration analysis; report counts of valid UUIDs, missing users, malformed values, and proposer/evaluator collisions. Do not change production rows during analysis.
3. Implement and review the UUID/attestation migration, with explicit handling for invalid legacy rows and rollback procedure.
4. Implement authenticated registration and evaluator assignment routes, service validation, immutable audit evidence, and server-owned authority composition.
5. Add pure, API/service, SQL privilege, and failure tests above. Run them on a disposable DB, then run exact-head CI.
6. Independently adversarially review identity spoofing, cross-project scope, capability revocation, assignment tampering, and service-role trust boundaries.
7. Only after all gates pass may a separate authorized workstream collect prospective experiment results. This document itself does not authorize production migration, model spend, activation or promotion.

## Acceptance statement

The authority adapter may return `independenceVerified: true` only when canonical UUID identities, the immutable scoped assignment attestation, current project capabilities, evaluator eligibility and conflict checks all pass against canonical persisted records. Distinct text values, policy-supplied booleans, a caller-created receipt, synthetic tests, or a successful runner status are insufficient.
