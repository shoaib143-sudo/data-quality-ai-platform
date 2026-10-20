# Independent post-merge adversarial review: learning experiment runner

Date: 2026-10-03  
Implementation PR: [#1109](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/1109)  
Merge commit: `5db53275d683c0da10dafa13ce2e2fce3d44eec9`  
Reviewed workflow: [run #36960272989](https://github.com/shoaib143-sudo/data-quality-ai-platform/actions/runs/36960272989)

## Review decision

**The runner merge is verified as source integration, with an unresolved production profiling gate and substantial pre-activation integration work.** The post-merge `verify` job passed. The separate `live-production` job failed its production estate assertion for four active dataset versions without completed profiles. This finding does not establish a runner implementation regression, and it must not be ignored or retried without changing the underlying state.

No live agent learning result, model invocation, successful production runner migration, or improvement claim is evidenced. The current implementation is a fail-closed runner foundation with tested ports; it is not proof of live self-improvement.

## Independent evidence examined

- The merge identity in the live workflow log: `5db53275d683c0da10dafa13ce2e2fce3d44eec9`.
- Workflow jobs: `verify` completed successfully; `live-production` failed at `Validate live production profiling estate`.
- Failure artifact `profiling-production-validation-5db53275d683c0da10dafa13ce2e2fce3d44eec9`, ID `11207414206`, SHA-256 `de084ced2acf4dee8441f21aec485268262e0d352e13f0eee324de89af40be9e`.
- The exact runner migration and testing harness DDL at the merged checkout.
- Existing implementation and prior post-implementation documentation, including their stated activation boundaries.

## Production validation finding

The live validation emitted these four failing records:

| Dataset version ID | Finding |
| --- | --- |
| `95290660-8f89-46c2-82b9-9ddc41855c28` | Active source has no completed profile |
| `4e72a0ab-934d-46b2-9d48-88a648d98c09` | Active source has no completed profile |
| `fbcd0322-01a8-4e36-a555-4ade67190e8a` | Active source has no completed profile |
| `abc5f2a7-898e-47f9-a8b2-5ab0c62870ed` | Active source has no completed profile |

Separately, latest run `f2b7b85c-170b-4280-a0e9-8788709aa779` for version `fde96b74-4a18-4ecb-9769-74c52ccf3600` was `FAILED` with `ORPHANED_RUN_RECOVERED`. The CI snapshot counted one active dataset with a non-completed latest attempt. This is a warning in the artifact, not one of the four failure assertions. The appropriate next action is a controlled investigation and normal authorized correction, followed by evidence-backed validation. Re-running unchanged production state would be a blind retry.

The artifact reports 63 profile runs and 46 completed runs, and `result.valid` is false specifically because of the four active-source assertions. These aggregate counts do not prove that any agent-learning adapter is working.

## Adversarial findings and gaps

| Concern | Finding | Required control before activation |
| --- | --- | --- |
| CI signal conflation | One production estate check failed while code verification passed. Calling the entire merge “failed” would overstate a runner defect; calling all checks “green” would hide a live data-quality gate. | Report the job-level split and track remediation independently. |
| Retry semantics | The live failure reflects observed state, not a transient CI transport problem. | Do not retry until profile/source state is reconciled and authorized. Preserve before/after evidence. |
| Testing schema isolation | Existing `testing` contains only private synthetic fixture tables. Runner migration targets qualified `agent` tables/functions and references `governance.ai_model_cost_events`. | Exercise exact DDL in a disposable database with dependencies. Do not describe fixture-schema tests as exact production migration deployment. |
| Migration plan contradiction | Earlier plan says apply the runner migration to `testing`, but unchanged DDL creates canonical tables in `agent` and uses qualified `agent`/`governance` dependencies. | Correct the plan. Do not mechanically rewrite schemas and claim production parity. Any shared-project `agent` migration requires separate review and authorization. |
| Trust adapter completeness | Stored plan/artifact verification, current authority, replay loader, real pricing and spend cap, evaluator identity/calibration, and complete evidence loader remain ports or blockers. | Implement each server-owned adapter; bind resolved bytes and records to immutable run identity; test unavailable or mismatched inputs fail closed. |
| Prospective evidence | Synthetic fixture tests do not establish a better result for a real agent. | Capture prospective baseline/candidate evidence per each of eight agents and each supported run mode using independently authored held-out cases. |
| Independent evaluation | A score reference or caller boolean does not prove evaluator independence or that all attempts were loaded. | Verify actor authority, evaluator independence, raw output bytes, all attempts, cost evidence, rubric/calibration, and sample denominator from canonical stores. |
| Billable ambiguity | A timeout after provider acceptance can leave uncertain execution and cost. | Keep immutable claims; do not reclaim ambiguous attempts or dispatch twice. Require explicit reconciliation evidence. |
| Promotion and self-modification | Runner completion is not candidate release authority. | Keep confirmation false and automatic promotion disabled. Require existing approval, canary, verification, rollback, and separately authorized activation. |

## Unit, negative, and failure-case audit plan

Before accepting the adapter integration, re-run these against the exact integration commit and disposable SQL environment:

1. **Identity and integrity:** wrong tenant/project, logical policy key substituted for policy row UUID, wrong agent/mode/candidate/version/manifest/case/arm/run, swapped artifact, mutated input bytes, and hash mismatch.
2. **Dataset isolation:** training-case dispatch, altered held-out membership, changed source version, duplicate or related case leakage, repeated input hash, and inconsistent baseline/candidate inputs.
3. **Authority and review:** missing, expired, or revoked execution authority; unauthorised evaluator; proposer/reviewer collision; evaluator calibration missing or stale; and forged confirmation.
4. **Accounting and spending:** quote unavailable or stale, unsupported model, wrong currency, missing reservation, partial or duplicated settlement, wrong invocation/run/project binding, token mismatch, cost mismatch, zero/negative/over-cap amount, and stale budget reservation.
5. **Recovery and concurrency:** concurrent claims, provider rejection, pre-dispatch timeout, post-acceptance timeout, worker crash before evidence persistence, duplicate resume, cancellation before/after side effects, repeated completion, conflicting completion, and ambiguous outcome. Assert no second provider call after ambiguity.
6. **Scoring and denominator:** missing/duplicate arm, omitted failed attempts, mismatched rubric, missing score, out-of-range score, fabricated confidence bounds, insufficient gain, safety/authority regression, and non-reproducible aggregate.
7. **Storage and privilege:** direct browser access to testing and runner tables, RLS/grant inspection, service-role scope, immutability, malformed/null JSON, transaction rollback, foreign-key isolation, and SQL lock behavior.
8. **Synthetic separation:** attempt to promote fixture output, fixture score, or synthetic accounting as live evidence. Assert rejection at ingestion, aggregate collection, and release admission.

For each failure, verify the system stops before an unauthorized side effect, records the failure accurately, keeps candidate promotion disabled, and does not emit a positive-learning claim. Fixture success is test evidence only.

## Revalidation checklist and completion gate

- [ ] Reconcile the four active dataset-version gaps through authorized profiling operations or correct erroneous active metadata with an audit trail.
- [ ] Investigate the orphan-recovered failed run separately; determine whether its active dataset should remain active and capture canonical evidence.
- [ ] Re-run production profiling validation only after state reconciliation; confirm the new artifact and result, rather than relying on the old snapshot.
- [ ] Use disposable PostgreSQL/PGlite with complete `agent` and `governance` dependencies to validate exact runner DDL, constraints, grants, RLS, RPC behavior, and concurrency.
- [ ] Keep Supabase `testing` fixtures explicitly synthetic; prove fixture records cannot enter live learning or release ledgers.
- [ ] Implement and review all required live adapters and budget controls.
- [ ] Collect genuine prospective paired results per agent and mode. Include failures and incomplete attempts in the denominator.
- [ ] Re-run unit, integration, negative, failure, adversarial, and exact-head CI checks; attach evidence to the integration commit.
- [ ] Obtain a fresh independent review of the real evidence chain. Preserve human approval and activation as a separate gate.

## PR #1122 independent audit follow-up

The independent PR review identified three concrete concerns: the local fixture scripts trusted localhost and a nonempty database name without an explicit destructive opt-in; the testing-schema migration was absent from both workflow path filters; and the schema-boundary check only recognized a narrow set of `testing.*` DDL forms.

The follow-up patch requires `DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM=I_ACCEPT_DESTRUCTIVE_FIXTURE` and a `datanexus_fixture_` database name in both SQL fixture scripts. Each CI database job now creates and targets a separately named fixture database. The boundary test rejects any uncommented `testing.` reference in runner/budget migrations, checks the testing-schema migration path appears in both `pull_request` and `push` filters, and verifies both scripts stop before connecting when the destructive opt-in is missing.

### Completed follow-up evidence

- Updated PR head: `36a1e27e39e252f5db4f498056e8d2863840e956`.
- Fresh independent review confirmed the three prior findings are addressed and found no high-severity regression.
- All 44 exact-head GitHub workflow runs completed successfully. Continuous Learning Governance passed all four jobs, including fresh disposable runner and budget PostgreSQL concurrency fixtures. Post Implementation Assurance, Release Governance, Quality Gate, CodeQL, and Repository Governance passed; production deploy/canary jobs were skipped.
- Local runner behavior (119 scenarios), service, four schema-boundary assertions, budget (24 agent/mode cases), evaluation policy/admission, TypeScript, and `git diff --check` passed.

Residual limitations remain explicit: a local hostname plus the `datanexus_fixture_` name and opt-in cannot prove that an operator has not pointed a local proxy at shared infrastructure. CI instead uses fresh isolated service containers. The SQL boundary detector is textual rather than a full SQL parser; current runner and budget migrations pass it and contain no `testing.` reference after comments are stripped. These limits are not hidden by the green CI result.

## Limits

This review did not modify production, trigger profiling, retry GitHub Actions, apply a migration, call a paid provider, or create prospective learning rows. The four version IDs and orphaned attempt finding reflect the workflow snapshot generated on 2026-10-02, not a claim that the records remain unchanged on 2026-10-03. Verify the current estate through an authorized fresh read before any corrective action.
