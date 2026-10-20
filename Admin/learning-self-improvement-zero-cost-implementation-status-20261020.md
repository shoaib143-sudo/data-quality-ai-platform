# DataNexus self-improvement implementation status under a $0 cap

Date: 2026-10-20  
Repository: `shoaib143-sudo/data-quality-ai-platform`  
Working base: `348efe9e4251f2e02dfed7d5820b6988fd571f0f`  
Working branch: `learning/zero-cap-evidence-hardening-20261020`

## Executive status

The $0 spend cap is in force. This work used local synthetic fixtures and source review only. It made no provider calls, live source queries, Supabase writes, migrations, deployments, candidate promotions, or GitHub Actions runs.

DataNexus has a governed, fail-closed learning foundation, but the agents are not yet proven to improve themselves in production. The runner and policy tests show that an experiment can be prepared and unsafe or over-budget paths can be rejected. They do not show prospective improvement for any agent.

This branch adds two narrow, zero-cost guard improvements:

1. Paired benchmark and evaluation-ledger evidence references now require a UUID format. The evaluation ledger rejects duplicate references before persistence.
2. The disposable SQL budget fixture now checks that a policy with both cost budgets set to zero rejects a positive verified quote with `RUN_BUDGET_EXCEEDED` and creates no reservation.

## Five workstream results

| Workstream | Result | Remaining gap |
| --- | --- | --- |
| Immutable candidate artifacts | Reviewed runner and object-store ports. Runner verifies bytes against hashes, but artifact/plan loading is injected. The generic object store uses upsert and is not an immutable candidate store. | Add a canonical manifest and create-only artifact storage, then verify bytes and hashes on readback. |
| Held-out replay evidence | Added UUID-format and uniqueness validation for evidence references, plus malformed and duplicate-reference negative cases. | No loader resolves a manifest case reference to sealed replay bytes and proves the evaluated input hash matches those bytes. |
| Proposer and evaluator authority | Reviewed evaluation policy, service and SQL RPC. Actor identifiers are opaque caller-provided strings; distinct strings do not prove independent identity. Caller-supplied `independentlyVerified` and `recordedBy` values are persisted without a separate attestation proof. | Bind actors to authenticated users and current project capabilities; persist an append-only, exact-scope evaluator assignment and evidence attestation; derive verification server-side. The canonical evaluator capability must be selected or added. |
| Independent adversarial review | Re-ran relevant local test gates. Recorded additional failure cases: cancellation after claim may leave an ambiguous claim; transport timeout after provider acceptance must retain its reservation and never retry; settlement read errors or mismatches must block evidence completion. | Add explicit recovery/terminal evidence and fault-injection coverage for those cases when the corresponding adapters exist. |
| $0 cost boundary | Existing runtime budget fixture covers 24 agent/mode combinations and failure paths. Added a SQL negative case for a zero cap with a positive quote. | PostgreSQL/Docker are unavailable in this workspace, so the new SQL fixture case has not executed here. Validate it in a disposable database only if the owner confirms the CI/compute cost is still $0. |

## Local verification evidence

Executed on 2026-10-20 against local code with synthetic records:

| Check | Result |
| --- | --- |
| `pnpm run verify:learning-experiment-runner` | PASS: 119 runner scenarios, service checks, and 4 schema-boundary assertions |
| `pnpm run verify:learning-experiment-budget` | PASS: 24 agent/mode combinations plus failure paths |
| `pnpm run verify:learning-evaluation-policy` | PASS: policy, release admission, command-center and admission behavior suites |
| `node --experimental-strip-types scripts/test-governed-learning-evaluation-ledger.mjs` | PASS, including malformed and reused evidence-reference rejection |
| `node --experimental-strip-types scripts/test-governed-learning-paired-benchmark.mjs` | PASS, including malformed and duplicate evidence-reference rejection |
| `pnpm exec tsc --noEmit` | PASS in the original working checkout |
| `git diff --check` | PASS |

The new SQL case is not included in the executed test results. `psql` and Docker were unavailable, and no remote Actions job was started because it could incur spend.

## Post-implementation plan

The following order keeps all changes behind explicit evidence gates:

1. **Finish the local branch review.** Re-run the TypeScript and focused tests against the clean branch based on the latest fetched `main`. Inspect the final diff and confirm it contains only the intended evidence validation, zero-cap fixture, and this status document.
2. **Validate the database fixture without spend.** Run the SQL fixture only on a disposable local PostgreSQL instance. If unavailable, leave the SQL case marked unexecuted. Do not substitute the shared Supabase `testing` schema for a disposable database.
3. **Implement immutable artifacts.** Add the canonical manifest schema and server-only create-only writer/reader. Test duplicate-key writes, tampering, missing objects, stale version, hash mismatch, cross-project access, and read outages.
4. **Implement exact held-out replay loading.** Resolve manifest case references to sealed byte payloads. Bind source, case, split, version and payload digest. Test missing, duplicate, leaked training case, tampered bytes, stale manifest, access denial and loader timeout. Assert no dispatch on every failure.
5. **Implement trusted reviewer identity.** Use authenticated UUIDs, canonical project capabilities, immutable assignment evidence and an append-only evaluator attestation bound to the evidence digest. Derive `independentlyVerified` on the server. Test forged identity, same reviewer/proposer, revoked capability, cross-project IDs, ambiguous assignment and unavailable auth/database.
6. **Build the complete attempt and result collector.** Record every attempt, cancellation, timeout, reservation, settlement and paired result. A provider acceptance timeout must not be retried or refunded without authoritative reconciliation. Test partial writes, duplicate callback, stale attempt, settlement mismatch and lost response.
7. **Prove the $0 guard end to end.** Require a provider quote of exactly zero, zero source-query cost, a zero policy budget, and an admission result that denies every positive estimate before dispatch. Test unknown price, missing quote, positive quote, currency mismatch, reservation race and provider price change. No prospective run until the guard can be demonstrated without incurring charges.
8. **Bind cases to all agents and modes.** Independently author and hash held-out case sets for each agent and supported execution mode. Collect prospective paired results only after the artifact, replay, authority, accounting and zero-cost gates pass. Keep automatic promotion disabled.
9. **Run final verification and independent adversarial audit.** Run pure unit tests, exact migration tests in disposable PostgreSQL, SQL privilege/RLS tests, concurrency tests, negative and failure tests, TypeScript checks, and schema boundary tests on the exact commit. Require a reviewer independent of proposer/evaluator and record evidence/run IDs. No production migration, provider call, activation or promotion is implied by this plan.

## Adversarial audit matrix to retain

For every failure below, assert zero provider dispatch, zero prospective result writes, zero candidate activation, and no positive learning claim:

- Caller supplies forged `independentlyVerified: true`, evaluator ID, attestation ID, project ID, candidate ID, manifest ID or result digest.
- Evaluator equals proposer, uses malformed identity, loses capability, is revoked, or is outside the scoped project.
- Evidence UUID is malformed, reused across arms, or does not resolve to the exact stored evidence row.
- Held-out case is missing, duplicated, in training data, stale, cross-project, or has tampered payload bytes.
- Artifact is overwritten, unavailable, stale, cross-bound to another candidate, or its content hash differs.
- Quote is positive, unknown, stale, in another currency, or changes between quote and invocation while the spend cap is zero.
- Reservation races, duplicated dispatch, process cancellation after claim, timeout after provider acceptance, callback replay, settlement mismatch or read outage.
- SQL runs under anonymous/authenticated roles, malicious search path, missing capability, or concurrent policy/attestation mutation.

## Operational boundary

At the current $0 cap, production profiling, live source queries, provider invocations, production or shared-Supabase migrations, deployment, CI reruns that may use paid minutes, and candidate promotion remain paused. Local deterministic and synthetic tests are permitted. Resuming any cost-bearing path requires an independently verified zero-cost route or a changed spend cap.
