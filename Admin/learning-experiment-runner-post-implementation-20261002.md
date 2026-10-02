# Learning experiment runner post implementation plan and results

Date: 2026-10-02  
Implementation PR: [#1109](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/1109)  
Source checkpoint revalidated: `140e31de8a629cdf0f76698f2ac60bc4e446f85e`

## Completion boundary

This post implementation pass verifies the runner code and its fail closed behavior. It does not claim that DataNexus is already self improving in production. The migration is still unapplied to the live database, and concrete plan, authority, replay, pricing and independent evaluator adapters plus an approved spend bound remain activation gates. No live provider call, live result write, candidate promotion, source remediation or release is included.

## Verification results

| Gate | Procedure | Result | Evidence |
| --- | --- | --- | --- |
| Exact source identity | Compare local branch and PR head | PASS | `140e31de8a629cdf0f76698f2ac60bc4e446f85e` |
| Runner unit and behavior cases | Run `pnpm run verify:learning-experiment-runner` | PASS | 119 disposable scenarios; service checks confirm preparation default, activation denial, canonical scope/accounting and fail closed reads |
| SQL behavior and privileges | Apply real migration and SQL fixture in disposable PGlite PostgreSQL | PASS | Completion, idempotency, conflict, synthetic rejection, output digest, canonical accounting, failed attempt, RLS and grants asserted |
| Budget regressions | Run `pnpm run verify:learning-experiment-budget` | PASS | 24 agent/mode combinations and failure cases |
| Learning evaluation regressions | Run `pnpm run verify:learning-evaluation-policy` | PASS | Policy binding, admission, chronology, missing evidence, budget stop and safety rejection checks |
| Type safety | Run `pnpm exec tsc --noEmit` | PASS | No TypeScript errors |
| Native PostgreSQL concurrency | PR CI PostgreSQL 16 fixture | PASS | Ten concurrent sessions contend for the same case/arm; one durable claim is acquired |
| Protected PR validation | PR CI on source checkpoint | PASS | Required checks completed successfully; skipped workflows were not applicable. One duplicate Repository Governance run was cancelled after a PR description edit; no failing check was reported. |
| Independent adversarial review | Re-read runner, invocation, composition, scoring, SQL, tests and integration boundary | PASS WITH ACTIVATION BLOCKERS | Findings below; no defect found in the bounded implementation contract. Concrete production adapters remain mandatory. |

## Adversarial cases reviewed

| Attack or failure case | Expected control | Verification |
| --- | --- | --- |
| Wrong project, policy record, candidate, run, dataset, version, case, arm or artifact | Reject immutable identity mismatch | Unit and SQL binding cases |
| Training case or non held out input | Reject before dispatch | Runner and SQL held out checks |
| Reused case input falsely presented as independent | Reject duplicate input digest | Runner scoring cases |
| Resume after uncertain external dispatch | Return ambiguous and do not call provider again | Durable claim behavior and concurrency fixture |
| Duplicate terminal write | Accept identical completion idempotently; reject changed evidence | SQL completion assertions |
| Cancel or provider failure after claim | Persist terminal failure/cancel; never reclaim the claim | Failure outcome assertions |
| Synthetic output enters live evidence | Reject synthetic provenance at invocation and SQL completion | Runner and SQL negative cases |
| Altered output bytes or digest | Reject output digest mismatch | SQL fixture |
| Missing, duplicate or mismatched reservation, settlement or cost event | Reject canonical evidence | Service and SQL accounting cases |
| Unpriced, non USD or mismatched token/cost accounting | Reject settlement | Service and SQL accounting cases |
| Browser role attempts table or RPC access | Deny access | SQL privilege assertions for anon and authenticated |
| Unapproved activation or missing dependencies | Stop before dispatch, claim or provider call | Service tests assert zero claims and provider calls |
| Pair missing an arm, score or settlement | Mark inconclusive and prohibit prospective writes | Scoring negative cases |
| Authority violation, safety failure, weak gain or missing confirmation | Never auto promote; require existing release admission | Scoring and evaluation policy tests; confirmation remains false |

## Independent review findings and limits

1. The production boundary is fail closed: preparation is the default, provider execution requires explicit activation dependencies, and synthetic dispatch is rejected.
2. Durable claims deliberately have no lease reclamation. A crash after an external side effect creates an ambiguous attempt that must be reconciled, not blindly replayed.
3. SQL validates project and identity bindings, held out membership, immutable outcomes, output digests and canonical accounted USD cost evidence. Browser roles cannot read or write this evidence through the table or RPC grants.
4. Service role can write claim/outcome rows directly. SQL constraints and triggers protect evidence shape and immutability, but a compromised service role remains a trusted server boundary. This is not represented as protection against a malicious service role.
5. Injected plan verification, actor authority, activation, replay, pricing and evaluator ports are interfaces, not deployed implementations. Passing fixture tests does not prove these integrations exist or are correctly wired in production.
6. Independent scoring receipts still require a trusted canonical loader to verify the reviewer, all attempts, and evidence bytes. Confirmation is hard false and prospective writes are disabled in this runner checkpoint.

No production blocker was found in the implemented fail closed module behavior. Items 4 through 6 are explicit pre activation controls and must be resolved before any real experiment is enabled.

## Remaining work before any live activation

1. Merge PR #1109 only through normal repository review and branch protection.
2. Apply the forward only migration to the approved `testing` schema and verify grants, RLS and schema behavior there. Do not apply it to production without explicit production change authorization.
3. Implement and independently review canonical stored plan and artifact byte verification, current project/agent/mode authority, held out replay loader, verified quote/pricing and hard spending cap, independent evaluator identity/calibration, exhaustive attempt/evidence loader, and confirmation evidence.
4. Bind each of the eight agents and every supported run mode to independently authored evaluation cases and scoring evidence. Collect prospective results without candidate promotion.
5. Re run all cases in this plan against the resulting integration commit and test schema. Consider activation only after a separate policy and production authorization decision.

## Revalidation and negative test plan for the integration phase

The following must run again after real adapters are added. A failure, missing row, ambiguous identity, unavailable authority source, or unpriced invocation must stop the run and leave candidate promotion disabled.

- **Identity matrix:** wrong project, policy row UUID versus logical key, agent, skill, mode, baseline, candidate, run, manifest, dataset version, case and arm.
- **Replay and independence:** training split, changed bytes under same label, swapped artifact, repeated input hash, shuffled order, altered case set and a baseline/candidate input mismatch.
- **Dispatch recovery:** two simultaneous claimers, timeout before provider call, timeout after provider acceptance, process crash before evidence persistence, duplicate resume, cancellation during each phase, and conflicting terminal replay.
- **Budget and accounting:** quote unavailable, stale quote, missing reservation, partial settlement, duplicate settlement, wrong run/project/invocation, unpriced event, wrong currency, token mismatch, cost mismatch, spend cap boundary and over cap.
- **Scoring and learning decision:** missing score, duplicated score, incomplete pair, wrong rubric/calibration, reviewer equals proposer, unauthorized reviewer, out of range score, safety/authority violation, insufficient gain, false confirmation and omitted attempt.
- **Security and persistence:** anon/authenticated access denial, service role scope checks, RLS enabled, immutability, malformed JSON, SQL nulls, transaction rollback and concurrency uniqueness.
- **Cost boundary:** use synthetic fixtures and disposable database only. A live provider call or production migration requires separate authorization.

## Exit criteria

Post implementation validation for this source checkpoint is complete. The system must remain in preparation mode until every live adapter is implemented, test schema verification passes, prospective results are collected per agent and mode, the independent review approves the evidence chain, and explicit activation authorization is recorded.
