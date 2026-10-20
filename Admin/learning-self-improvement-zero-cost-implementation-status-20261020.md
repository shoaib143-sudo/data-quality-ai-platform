# DataNexus self-improvement implementation status under a $0 cap

Date: 2026-10-20  
Repository: `shoaib143-sudo/data-quality-ai-platform`  
Working base: `348efe9e4251f2e02dfed7d5820b6988fd571f0f`  
Working branch: `learning/zero-cap-evidence-hardening-20261020`

## Executive status

The $0 spend cap is in force. This work used local synthetic fixtures and source review only. It made no provider calls, live source queries, Supabase writes, migrations, deployments, candidate promotions, or GitHub Actions runs.

DataNexus has a governed, fail-closed learning foundation, but the agents are not yet proven to improve themselves in production. The runner and policy tests show that an experiment can be prepared and unsafe or over-budget paths can be rejected. They do not show prospective improvement for any agent.

This branch adds zero-cost implementation and guard improvements:

1. Paired benchmark and evaluation-ledger evidence references now require UUID text and compare uniqueness case-insensitively. The evaluation ledger rejects malformed or reused references before persistence. This is a format check, not proof that a stored evidence row exists or is bound to the cited case.
2. A pure immutable-artifact store port verifies SHA-256, readback, scope and create-only behavior against an injected backend. It has no production storage integration.
3. A pure replay-byte resolver recomputes a deterministic content hash that includes each case payload hash, then pins manifest/project/dataset/case identity and held-out split. The canonical dataset manifest schema currently lacks per-case payload hashes and a trusted canonical reader, so this resolver is not production-wired.
4. A synthetic runtime test with mocked zero-budget admission exercises positive, unknown and non-USD quote rejection at a $0 cap and asserts zero provider calls, accounting writes and prospective results.
5. The disposable SQL budget fixture checks that a policy with both cost budgets set to zero rejects a positive reservation estimate with `RUN_BUDGET_EXCEEDED` and creates no reservation. It does not verify provider pricing or dispatch behavior.
6. Added the distinct `agent.learning.evaluate` authorization capability. Its role-array grant is limited to `DATA_GOVERNANCE_ADMIN`; the existing governance RPC still gives organization owners and admins its pre-existing broad bypass. Policy registration derives proposer from the verified server session, requires `agent.admin`, resolves an existing evaluator account, and checks the evaluator's project capability. A new append-only UUID assignment binds proposer/evaluator and exact policy scope; the assigned evaluator must acknowledge through an authenticated operation before recording results or release review. Result recording loads the immutable policy from storage, binds the session user to the persisted evaluator, writes the session identity as recorder, and checks current capability. Evidence flags, quality metrics, and `independentlyVerified` remain caller supplied and untrusted without server-derived attestation.
7. Added an offline Supabase Storage adapter for create-only artifact writes, readback, and failure handling. The adapter is not wired into the experiment runner, and no bucket or storage ACL was provisioned.

## Five workstream results

| Workstream | Result | Remaining gap |
| --- | --- | --- |
| Immutable candidate artifacts | Added a pure port and a Supabase Storage adapter that requests create-only uploads, maps duplicate/missing responses, and propagates read/write outages. Synthetic tests cover the adapter and integrity port. | Provision and secure the bucket, validate atomic create-only behavior in the agreed test environment, wire this backend into canonical runner loading, and verify access control. |
| Held-out replay evidence | Added a pure byte resolver that recomputes the snapshot content hash, including per-case payload hashes, and binds manifest/project/dataset/case/split/version. Tests reject tampered manifest fields, missing bytes, payload tampering, leakage and scope mismatch. | The current canonical manifest schema lacks a per-case payload hash and no trusted canonical sealed-byte reader is wired. Add and review both before production use. The resolver's expected hash must come from that trusted reader, not request input. |
| Proposer and evaluator authority | Registration derives proposer from session, requires `agent.admin`, validates the evaluator account and capability, and creates append-only UUID-backed assignment evidence. A service-role-only SQL wrapper creates the locked policy and assignment in one transaction. Legacy unassigned policies cannot be backfilled. An authenticated acknowledgement is required before results and release review; observations must postdate acknowledgement and cannot be future-dated. | Atomic registration and temporal constraints are statically checked but have not run in PostgreSQL. The evidence-attestation layer is still missing: derive evidence completeness and `independentlyVerified` server-side, and bind them to verified evidence digests. Legacy policy rows remain untrusted and ineligible. |
| Independent adversarial review | Re-ran relevant local test gates. Recorded additional failure cases: cancellation after claim may leave an ambiguous claim; transport timeout after provider acceptance must retain its reservation and never retry; settlement read errors or mismatches must block evidence completion. | Add explicit recovery/terminal evidence and fault-injection coverage for those cases when the corresponding adapters exist. |
| $0 cost boundary | Existing runtime budget fixture covers 24 agent/mode combinations and failure paths. A synthetic runtime test using a mocked zero-budget admission proves the executor makes zero dispatch/accounting/result writes for positive, unknown and non-USD quote outcomes. Added a SQL negative case for a positive reservation estimate against zero budgets. | PostgreSQL/Docker are unavailable in this workspace, so the SQL fixture has not executed here. The runtime test does not prove the persisted database admission path. Validate SQL in a disposable database only if compute is confirmed to cost $0. |

## Local verification evidence

Executed on 2026-10-20 against local code with synthetic records:

| Check | Result |
| --- | --- |
| `pnpm run verify:learning-experiment-runner` | PASS: 119 runner scenarios, service checks, and 4 schema-boundary assertions |
| `pnpm run verify:learning-experiment-budget` | PASS: 24 agent/mode combinations plus failure paths |
| `pnpm run verify:learning-evaluation-policy` | PASS: policy, release admission, command-center and admission behavior suites |
| `node --experimental-strip-types scripts/test-governed-learning-evaluation-ledger.mjs` | PASS, including malformed and reused evidence-reference rejection |
| `node --experimental-strip-types scripts/test-governed-learning-paired-benchmark.mjs` | PASS, including malformed and duplicate evidence-reference rejection |
| `node --experimental-strip-types scripts/test-immutable-learning-artifact-store.mjs` | PASS, synthetic backend: duplicate, missing, tampered, scope mismatch and failed readback |
| `node --experimental-strip-types scripts/test-held-out-replay-byte-resolver.mjs` | PASS, synthetic source: changed manifest fields, missing/stale source, leaked, tampered and cross-scope cases |
| `node --experimental-strip-types scripts/test-learning-experiment-zero-cost-gate.mjs` | PASS, mocked admission: positive, missing and non-USD quote cases make zero provider calls and zero prospective writes |
| `pnpm run verify:agent-learning-evaluate-capability` | PASS, capability grant/guard, registration actor derivation, persisted evaluator binding, mismatch, malformed UUID, missing account, authorization denial, and write failure cases |
| `pnpm run verify:immutable-learning-artifact-storage-adapter` | PASS, synthetic Supabase Storage client: create-only option, duplicate/missing handling, invalid scope, and storage failure behavior |
| `pnpm run verify:learning-evaluation-policy` | PASS after evaluator capability integration |
| `pnpm exec tsc --noEmit` | PASS after evaluator capability integration |
| `git diff --check` | PASS after evaluator capability integration |

The SQL fixture case is not included in the executed test results. `psql` and Docker were unavailable, and no remote Actions job was started because it could incur spend. The TypeScript check was also rerun successfully on the clean branch after these adapters were added.

## Independent adversarial audit

The independent branch audit found and we corrected these issues before publishing the final branch state:

- Case-insensitive spellings of one evidence UUID could bypass duplicate detection. Both validators now normalize before uniqueness and aggregate comparisons; mixed-case duplicate tests were added.
- The $0 SQL fixture initially supplied the wrong candidate ID and described its input as a verified quote. It now supplies the candidate bound to the policy and describes the check narrowly as denial of a positive reservation estimate.
- The replay resolver initially compared two caller-visible manifest hash strings without recomputing content. It now recomputes a deterministic snapshot hash that includes each payload hash, rejects missing payload hashes before content-hash comparison, and tests tampering with a payload hash while leaving the stored digest unchanged.
- The status plan was updated to mark completed clean-branch checks and to identify that the $0 runtime test uses mocked admission.

The final read-only re-audit confirmed those findings are closed. This audit covers the pure code and local tests on this branch only. It does not certify a live Supabase/storage adapter, deployed authorization, pricing data, live evidence, or production safety.

The evaluator-capability change received a separate adversarial review. The first pass found that comparing the session UUID to caller-provided policy fields still allowed a forged policy object. The service now loads the immutable policy row by record ID, derives the policy contract from stored fields, binds the session user to the stored evaluator and result evaluator, authorizes the stored project, and only then writes. A second read-only review confirmed that path. The new assignment and acknowledgement changes now bind actor identities and policy scope, but SQL execution in PostgreSQL and server-derived evidence attestation remain outstanding. This work does not establish production-trustworthy independent-learning evidence.

The identity path requires the current session, derives the proposer, checks `agent.admin`, resolves the target account through the server-only Auth Admin API, and requires the target's current project evaluator capability. The evaluator acknowledges the exact persisted assignment as their authenticated identity. Mocked boundary tests cover forged proposer input, missing target account, same-user assignment, denied authority, missing policy or assignment or acknowledgement, scope mismatch, pre-ack and future-dated observations, read outage, evaluator mismatch, and transaction failure. The SQL is statically checked only; its behavior, privileges, triggers, and concurrency have not been run against PostgreSQL.

## Post-implementation plan

The following order keeps all changes behind explicit evidence gates:

1. **Complete clean-branch checks and review.** Focused runner, budget, policy, release-admission, artifact, replay, $0 runtime, evaluator identity, assignment, acknowledgement, and adapter tests pass locally; TypeScript and whitespace checks pass. Independent review found and drove fixes for legacy-policy backfill and pre-ack observation risks. Re-run checks after any further code changes and review the final diff before integration.
2. **Validate database migrations without spend.** Run both the SQL fixture and new migration on disposable local PostgreSQL, including RLS/grant checks, trigger behavior, concurrent/idempotent assignment and acknowledgement, and failure rollback. They are currently static checks only. If local PostgreSQL is unavailable, leave SQL execution marked unverified. Do not use the shared Supabase `testing` schema as a disposable database.
3. **Finish immutable artifacts.** The pure create-only port and tests are present. Add the canonical manifest schema and server-only production backend/reader. Prove the backend provides atomic create-if-absent, then test duplicate-key writes, tampering, missing objects, stale version, hash mismatch, cross-project access and read outages.
4. **Finish exact held-out replay loading.** The pure resolver is present. Extend the reviewed manifest schema with a per-case payload digest and implement its canonical sealed-byte reader. Test missing, duplicate, leaked training case, tampered bytes, stale manifest, access denial and loader timeout. Assert no dispatch on every failure.
5. **Complete trusted reviewer evidence.** Authenticated proposer/evaluator UUIDs, scoped immutable assignment, acknowledgement, and current capability checks are implemented locally. Policy-plus-assignment now use one SQL transaction, pending database execution validation. Add append-only evidence attestation bound to evidence digests; derive `independentlyVerified` and evidence completion server-side. Test forged identity/evidence, same reviewer/proposer, revoked capability, cross-project IDs, ambiguous assignment and unavailable auth/database.
6. **Build the complete attempt and result collector.** Record every attempt, cancellation, timeout, reservation, settlement and paired result. A provider acceptance timeout must not be retried or refunded without authoritative reconciliation. Test partial writes, duplicate callback, stale attempt, settlement mismatch and lost response.
7. **Prove the $0 guard end to end.** Require a provider quote of exactly zero, zero source-query cost, a zero policy budget, and an admission result that denies every positive estimate before dispatch. Test unknown price, missing quote, positive quote, currency mismatch, reservation race and provider price change. No prospective run until the guard can be demonstrated without incurring charges.
8. **Bind cases to all agents and modes.** Independently author and hash held-out case sets for each agent and supported execution mode. Collect prospective paired results only after the artifact, replay, authority, accounting and zero-cost gates pass. Keep automatic promotion disabled.
9. **Run final verification and independent adversarial audit.** Run pure unit tests, exact migration tests in disposable PostgreSQL, SQL privilege/RLS tests, concurrency tests, negative and failure tests, TypeScript checks, and schema boundary tests on the exact commit. Require a reviewer independent of proposer/evaluator and record evidence/run IDs. No production migration, provider call, activation or promotion is implied by this plan.

## Adversarial audit matrix to retain

For every failure below, assert zero provider dispatch, zero prospective result writes, zero candidate activation, and no positive learning claim:

- Caller supplies forged `independentlyVerified: true`, evaluator ID, attestation ID, project ID, candidate ID, manifest ID or result digest.
- Evaluator equals proposer, uses malformed identity, loses capability, is revoked, or is outside the scoped project.
- Evidence UUID is malformed, reused across arms with different letter casing, or does not resolve to the exact stored evidence row.
- Held-out case is missing, duplicated, in training data, stale, cross-project, or has tampered payload bytes.
- Artifact is overwritten, unavailable, stale, cross-bound to another candidate, or its content hash differs.
- Quote is positive, unknown, stale, in another currency, or changes between quote and invocation while the spend cap is zero.
- Reservation races, duplicated dispatch, process cancellation after claim, timeout after provider acceptance, callback replay, settlement mismatch or read outage.
- SQL runs under anonymous/authenticated roles, malicious search path, missing capability, or concurrent policy/attestation mutation.

## Operational boundary

At the current $0 cap, production profiling, live source queries, provider invocations, production or shared-Supabase migrations, deployment, CI reruns that may use paid minutes, and candidate promotion remain paused. Local deterministic and synthetic tests are permitted. Resuming any cost-bearing path requires an independently verified zero-cost route or a changed spend cap.
