# Evaluation policy implementation status

2026-09-30. PR #1091 now contains the typed policy validator and result classifier plus persistent prospective evaluation evidence and release-path admission binding.

Implemented:
- fail-closed policy validation across project, candidate, agent, skill, mode, datasets, versions, evaluator separation, immutable manifest, analysis plan, positive gain, score, cost, token and latency limits;
- result classification that separates STOPPED, REJECTED and REVIEW_REQUIRED from IMPROVED, REGRESSED and INCONCLUSIVE;
- append-only `agent.learning_evaluation_policies` and `agent.learning_evaluation_results` with project RLS and no browser mutation grants;
- service-role-only policy/result RPCs with duplicate, cross-candidate, version, safety, evidence, sample, uncertainty and budget validation;
- release admission requiring a persisted REVIEW_REQUIRED + IMPROVED decision with automatic promotion disabled;
- exact evaluation policy/result, manifest, mode and evaluator bindings added to the existing approval fingerprint;
- controlled-release revalidation of the same prospective evaluation evidence before canary and activation;
- latest-policy and latest-decision precedence, so a newly locked policy or newer rejection, regression, stop or inconclusive result invalidates older positive eligibility;
- sealed benchmark-manifest identity binding, including registered manifest ID/hash/version and temporal cutoff validation at persistence time;
- read-only Learning Governance observability for locked policies, evaluator/manifest identity, decision quality/disposition, uncertainty, safety and accounting evidence;
- essential positive, negative, safety, regression, inconclusive, stale-positive and persistence/release-binding tests;
- Continuous Learning Governance CI coverage through `verify:learning-evaluation-policy`.

The existing canonical project runtime cost enforcement remains authoritative for provider execution. PR #1091 does not introduce a second resource-control plane. Its locked experiment budget is checked against recorded evaluation evidence. Admission and post-run accounting checks do not prove that experiment-specific limits interrupt an in-flight provider request; that execution-boundary integration remains to be demonstrated.

## Fail-closed attestation gate added 2026-10-20

The current result API accepts caller-provided aggregates and verification flags. Until a server-owned evidence loader and persisted attestation are implemented, caller claims for independent verification, evidence completeness, confirmation-window completion, or accounting completeness are rejected before the result RPC. The database also blocks every `IMPROVED` insert through a trigger. A follow-up audit found caller-supplied non-positive aggregates could still poison the immutable latest-result ledger, so the application now blocks all result writes, including `INCONCLUSIVE`, `REGRESSED`, and `REJECTED`, until that server-derived evidence path exists.

Validation added: regression coverage verifies caller-supplied positive claims and fabricated non-positive aggregates stop before persistence, that the DB migration blocks unattested positive inserts, and that legacy positive results cannot enter release admission. SQL validation here is static only. Do not run or deploy this migration until it has been reviewed and applied in a safe disposable database under the existing $0 constraint.

Independent audit on 2026-10-20 found two additional legacy-path risks. First, the existing paired-evaluation writer accepted UUID-shaped references and caller scores, then labeled rows `synthetic=false` without resolving the references to canonical outputs. Its persistence path is now disabled after input-shape validation until a trusted server-side output/evaluator attestation loader exists. Second, release admission could read a pre-existing `IMPROVED` row even though new inserts are blocked. Application admission now rejects every `IMPROVED` row until it is bound to a server-owned evidence attestation. These are defense-in-depth application gates; a database attestation column, an explicit ineligible-legacy-row rule, and SQL-level tests are still required before the gate can be safely reopened.

The runner now also records failed or cancelled terminal outcomes after a durable dispatch claim is acquired. A failure to persist that terminal marker leaves the claim ambiguous, which still blocks retries and positive evaluation. This does not settle unknown provider usage or release its reservation; canonical accounting remains required.

The follow-up dispatch ACL audit found that service-role table inserts could bypass the validated claim/outcome RPCs. Direct inserts are now revoked, and the dispatch write RPCs use fixed-search-path `SECURITY DEFINER` functions. The disposable runner/budget SQL fixture, including terminalization idempotency, conflicting terminal evidence, blank reasons, missing claims, and privilege assertions, now passes in local PGlite PostgreSQL; CI also runs the native PostgreSQL fixture with a separate-session concurrency check. This does not validate Supabase-specific runtime behavior or the legacy benchmark closure migration. The legacy aggregate benchmark writer fails closed before creating an admin client, and migration `20261020080000` replaces the old RPC body with an explicit exception while preserving its signature and grants. That database closure takes effect only after that migration is reviewed and applied; no hosted DB changes were made.

A pure evidence reconciler now checks exact sealed case/arm coverage, output byte hashes, evaluator and rubric bindings, canonical settlement/cost-event links, budget limits, and a stable digest. Adversarial unit cases cover missing pairs, tampered bytes, failed dispatch, artifact substitution, evaluator substitution, duplicate scores, unpriced or mismatched cost, and zero-budget violations. This module is only a deterministic verifier for trusted server-loaded records. It does not prove that those records came from trusted persistence, authorize an evaluator, compute the locked confidence bound, observe the confirmation window, persist an attestation, or enable result writes.

The read-only Learning Governance view now labels every current `IMPROVED` row as unattested and excludes it from the improved count. This avoids presenting caller-aggregate legacy rows as verified success before an attestation schema exists. The evaluator capability and evidence reconciliation suites are now included in the governance workflow and fast-path checks.

## Remaining implementation and post-implementation validation plan

The branch still cannot safely write a positive self-improvement decision. The following work is required before that gate can be replaced:

1. **Seal the experiment evidence set.** Persist a server-owned run manifest that enumerates the exact expected held-out cases and baseline/candidate arms, pinned candidate artifacts, input digests, policy digest, and one allowed attempt per pair. Finalization must prevent new claims and report every claim as completed, failed, cancelled, or unresolved. Missing, extra, conflicting, or unresolved evidence blocks a positive result.
2. **Persist assigned evaluator scores.** Add an append-only attempt score record bound to the immutable dispatch claim and completed outcome, exact input/output hashes, policy and manifest scope, assigned evaluator UUID and acknowledgement, current `agent.learning.evaluate` authorization, and immutable rubric/calibration digests. Reject duplicate or replaced scores and reject proposer self-review.
3. **Load and attest the evidence.** A server-only loader must read all expected claims, outcomes, exact output bytes, evaluator scores, canonical cost reservations/settlements/cost events, and explicit confirmation observations. It must exhaust pagination, use a consistent finalization boundary, then call the pure reconciler, derive the locked statistical confidence bound and confirmation-window state, and fail closed on read errors, partial pages, or any scope mismatch.
4. **Atomically attest and record.** Replace aggregate arguments to the current result RPC with a policy/run identity. In one database transaction, derive the decision, insert an immutable evidence attestation, and insert the result bound to that unique attestation. Add an attestation ID to the result schema and make release admission require it; quarantine all legacy `IMPROVED` rows without one. Reject reuse, cross-scope binding, and unattested `IMPROVED` writes, including direct `service_role` RPC attempts. Only after this passes should the temporary blanket `IMPROVED` trigger be replaced by attestation validation.
5. **Retire legacy benchmark paths.** Keep the aggregate benchmark RPC and app service disabled until their caller-supplied scores and references are replaced by the same server-owned attestation contract. Audit and quarantine any existing benchmark rows written through the old path before re-enabling it.
6. **Wire canonical runtime loaders.** Remove reliance on caller-supplied plan and verification callbacks for production. Compose the existing sealed replay-byte reader, immutable executable artifact loader, server authorization, durable dispatch store, canonical settlement reader, and the new finalization/evaluation loader. Default execution remains preparation-only, with automatic promotion disabled.

### Revalidation and audit gates

- **Unit and contract tests:** verify policy/manifest/run/evaluator/rubric/calibration/output/accounting bindings; score classification; confirmation timing; idempotency; and one-to-one expected case/arm coverage.
- **Negative and failure cases:** missing or extra pair; duplicate score, settlement, cost event, or attestation; forged actor or attestation ID; revoked evaluator capability; proposer-as-evaluator; wrong project/policy/candidate/run/mode/version; altered or missing input/output bytes; wrong hashes; partial pagination; DB read outage; unknown/exceeded cost; nonzero or unpriced cost at a zero budget; failed/cancelled/unresolved attempt; early/future/stale confirmation; concurrent finalization; and lost responses after score, attestation, or result commit.
- **Atomicity and bypass audit:** force a failure between each insert and assert rollback leaves no orphan attestation or result. Attempt direct service-role result RPC calls and reused/cross-scoped attestation IDs. Confirm RLS and grants keep browser roles read-only.
- **Legacy writer and dispatch ACL audit:** keep caller-scored paired-evaluation persistence disabled until references resolve to immutable output bytes; test stale legacy positives are rejected. Verify service-role direct inserts cannot forge dispatch claims/outcomes outside validated RPCs, and exercise concurrent terminal writes and the provider-accepted/worker-crashed ambiguous case.
- **Independent adversarial review:** inspect SQL and application call paths for alternate positive-write routes, mutable evidence, race windows, unbounded queries, and authority elevation. Resolve each finding and rerun the relevant tests.
- **Zero-cost validation:** run static migration contracts, synthetic application suites, type checks, and diff checks locally. The runner/budget/terminalization behavior fixture has passed in PGlite and is also wired to native PostgreSQL CI, but the legacy benchmark closure migration and Supabase-specific behavior still need direct SQL validation. No hosted database, provider call, migration, deployment, or live agent experiment is included under the current $0 cap.
- **Go/no-go:** keep positive results blocked until the local PostgreSQL fixture, all adversarial cases, independent audit, and full revalidation pass. Then collect prospective results by agent and run mode only through an authorized zero-cost execution path. Do not enable automatic promotion.

### Supabase test environment snapshot, read only, 2026-10-20

The connected project labelled `DataNexus UX E2E Controlled` currently reports no tables in the `testing` schema, six base tables in `agent`, and deployed migration history only through `20260929001618`. The learning evaluation and experiment runner migrations on this branch are not present in that project. No database writes were made.

The repository boundary test currently requires the production runner store and its migrations to remain on `agent`, and requires `testing` to stay a private synthetic fixture harness. That conflicts with using `testing` as a full database-backed runner test environment. Before attempting live SQL validation in this project, this boundary needs an explicit implementation path: either build a fully isolated `testing`-schema mirror with test-only adapters and grants, or use the existing disposable local PostgreSQL fixture to exercise the canonical `agent` SQL. The current snapshot cannot verify the learning migrations against Supabase, and the zero-cost rule rules out provider-backed prospective runs.

Still intentionally external to this implementation:
- real project/dataset selection and independent evaluator assignment;
- independently computed confidence/statistical evidence;
- actual prospective baseline/candidate outcomes;
- live candidate execution or promotion.

No automatic promotion is permitted. A technically successful run is not evidence of improvement. A candidate reaches release review only after a persisted, independently verified positive result satisfies the locked policy.

## Native capability challenge required by AGENTS.md

Current references reviewed 2026-09-30:
- OpenAI evaluation best practices: eval-driven development, task-specific datasets, continuous evaluation, human calibration of automated graders and production-representative cases.
- Arize/Phoenix agent evaluation guidance: versioned datasets and experiments, trace-derived failure taxonomies, deterministic and model-based evaluators, human calibration, CI evaluation and promotion of confirmed failures into regression suites.
- LangSmith evaluation concepts previously reviewed for offline versus online evaluation and evaluator separation.

DataNexus keeps authentication, project scope, RLS, evidence, approval, release and learning authority in its own control plane. External evaluation providers remain replaceable adapters rather than release authorities.

| Capability | Status | Disposition | Evidence / remaining boundary |
| --- | --- | --- | --- |
| Offline and online evidence separation | PARITY | KEEP | Immutable benchmark manifests plus prospective production ledger; first real candidate comparison still pending |
| Explicit experiment and result bindings | PARITY | KEEP | Exact candidate, versions, mode, evaluator, policy, manifest and decision are release-fingerprinted |
| Sealed held-out manifest binding | PARITY | KEEP | Registered manifest ID/hash/version and cutoff enforced by persistence RPC |
| CI evaluation and regression gating | PARITY | KEEP | Focused positive, negative, adversarial, release-admission and observability tests are mandatory |
| Learning decision observability | PARTIAL | KEEP | Locked policy and decision evidence is visible read-only; richer trajectory-level evaluator views are not part of this PR |
| Independent evaluator calibration | PARTIAL | KEEP | Evaluator separation plus rubric/calibration references are enforced; real reviewer calibration evidence remains operational |
| Runtime cost and latency stop enforcement | PARTIAL | BUILD_NOW | Existing project runtime controls remain authoritative; experiment-specific ceilings are checked on evaluation evidence, and in-flight enforcement remains unverified |
| Replaceable evaluator integration | PARTIAL | EXTENSION_POINT | Locked rubric, calibration and analysis references preserve provider-neutral integration |
| Trace or trajectory-level semantic evaluation | GAP_DEFERRED | BUILD_LATER | Existing traces and governed outcomes can support it, but this PR does not add an external or agent-as-judge control plane |

No ADR-007 agent classification, tool allowlist, mutation boundary, authentication, RLS authority or approval authority is expanded by this work. The new evaluation layer is benchmarkable and replaceable without surrendering DataNexus control-plane authority.

## Resume audit and behavioral verification

Added executable service tests with a test-only admin-client substitute. They verify project/candidate/policy query bindings, newest policy/decision selection, stale-positive invalidation, result reclassification, database error handling, missing accounting, budget excess and safety rejection. Both rows and their timestamps are inspected; tied or malformed chronology blocks admission rather than guessing with UUID order. Date parsing may conservatively treat sub-millisecond differences as a tie; a new unambiguous decision is required in that case.

Synthetic behavior tests do not prove real quality gain, organizational reviewer independence, empirical statistical confidence or runtime cost enforcement. They do not activate any experiment.
