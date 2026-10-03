# Governed self-improvement evaluation implementation plan

Date: 2026-09-30.
Tracking: PR #1091, branch docs/learning-evaluation-policy-20260930.
Policy: [prospective evaluation policy](learning-evaluation-policy-20260930.md).
Scope: implementation, integration, authorization correctness and essential unit/integration/negative/failure-path tests. Broad certification, load and chaos campaigns are separate.

## Objective and starting point

Deliver a repeatable governed loop: verified baseline evidence → bounded improvement proposal → independently evaluated candidate → controlled release → verified prospective outcomes → retain or roll back.

PR #1078 is merged and its infrastructure activated. The release deployed ab46b2fc7da5d66a7802ff822649e50d82d541f2 through Release Governance run 36660080924. Existing manifest, paired ledger, provenance capture, terminal denominator, delayed outcome collector and read-only Command Center are implemented. Reuse these contracts; do not rebuild them.

The last live read-only inspection on 2026-09-30 found zero coverage rows and zero prospective outcomes. Historical run inventory is in the policy and is not an empirical baseline. Recheck live counts before execution.

## Implementation phases

| Phase | Concrete work | Deliverable | Completion gate | Current status |
| --- | --- | --- | --- | --- |
| 0. Inventory | Inspect project membership, dataset access, currently supported runtime modes, deployed agent/skill versions and existing evaluation APIs | Exact activation inventory with evidence references | Every scope/version/mode is traceable; unavailable values remain explicit | Agent inventory done; project/candidate/evaluator binding pending |
| 1. Register experiment | Reuse existing experiment/version records where compatible; implement a typed activation record and fail-closed validation for uncovered fields | Immutable versioned evaluation specification and authorized review surface | Reject missing scope, unchanged candidate, unauthorized dataset, unsupported mode, self-evaluator and missing rollback/budgets | PARTIAL — immutable policy exists; durable case/arm runner identity added, live activation binding still pending |
| 2. Collect baseline | Observe new normal authorized GUIDED workloads; correlate terminal coverage, provenance and independently VERIFIED outcomes | Per-agent/mode baseline report with pending/excluded/negative counts | Source evidence complete; no synthetic row or historical relabeling counted | Runtime collection implemented; live evidence pending |
| 3. Create candidate | Derive a narrow prompt/skill change from verified failures; keep model/tool/policy identities frozen except declared change | Versioned proposal with diff, failure evidence and rollback reference | No authority expansion, registry self-mutation, source-data remediation or self-promotion | Proposal/gate implemented; exact candidate pending |
| 4. Evaluate offline | Bind independent scores to immutable held-out manifest cases; lock analysis before candidate results | Paired baseline/candidate evaluation evidence | Leakage, duplicate, missing side, mismatched aggregate, safety and adversarial checks reject invalid claims | Ledger/fixtures implemented; real cases/evaluator pending |
| 5. Controlled prospective evaluation | Use existing controlled-release path for approved agent/skill/project/mode; monitor budgets and stop conditions | Real candidate outcomes and contemporaneous baseline comparison | Bound scope, approval and accounting verified; rollback available | PARTIAL — durable budget guard + paired runner core implemented; no live executor/evaluator adapter |
| 6. Decide and retain evidence | Calculate predeclared quality gain, uncertainty, safety, cost, latency and evidence completeness per agent/mode | IMPROVED / REGRESSED / INCONCLUSIVE decision with immutable evidence | Positive sustained gain under locked policy; independent review before promotion | Planned |
| 7. Repeat | Retain failures and approved positive cases; propose the next bounded change | Auditable next cycle linked to predecessor | Fresh authorization and held-out separation each cycle | Pending first measured cycle |

Do not infer completion from a successful technical run. Baseline/candidate outcomes require independent business verification. No mode or agent inherits another's evidence.

## Five implementation workstreams

These are an implementation decomposition, not a claim that background agents are running.

| Workstream | Responsibility | Dependencies | Review artifacts |
| --- | --- | --- | --- |
| A. Scope and versions | Inventory project/dataset permissions; activation record; immutable baseline/candidate/rollback bindings | Existing registry/runtime authorization | Typed specification, negative authorization cases, binding report |
| B. Outcome completeness | Reconcile denominator, provenance, delayed verification, exclusions and real outcome evidence | Existing collector/coverage tables | Aggregate baseline report and missing-evidence drilldown |
| C. Independent evaluation | Per-agent rubric; evaluator calibration; manifest/binding; locked sample and analysis | A; representative real cases | Calibration record, independently scored case ledger and comparison |
| D. Release and budgets | Integrate existing controlled release, cost/token/latency caps, stop and rollback enforcement | A and C; explicit approved scope/caps | Preflight result, stop/rollback evidence and current authorization check |
| E. Observability and assurance | Display experiment identity, phase, evidence sufficiency and decision in Command Center; essential tests/docs | A–D contracts | Read-only UI, rejection tests and Admin/Major discussion status |

Inventory and repository/API review can proceed independently. Database mutations, controlled release and shared contract edits need sequential integration.

## Implementation contracts

First inspect existing routes, services and tables. Extend compatible contracts rather than add a second ledger.

Activation record:
- experiment ID/version, selected project and dataset/version allowlist;
- agent and skill keys, normalized mode plus original mode provenance;
- exact baseline/candidate identities, declared diff and rollback reference;
- independent evaluator/rubric/calibration evidence;
- immutable manifest/hash and temporal cutoff;
- primary metric, positive gain, sample/window, analysis and multiple-comparison handling;
- per-run/total cost and token caps, latency threshold and timeout;
- safety/authority boundaries, stop conditions, retention and approval reference.

The experiment becomes executable only after validation of concrete values and current actor authorization. A proposed threshold in Markdown must never silently become a runtime setting. Snapshot the approved specification; edits create a new version and cannot retroactively change prior results.

Baseline report:
- report timestamp and filter window;
- all eight canonical agents and explicitly applicable modes;
- terminal eligible count, verified count, pending count and excluded count with reasons;
- version/provenance conflicts, effectiveness taxonomy and independent quality scoring;
- cost/latency completeness and links to authorized source evidence.
Avoid outputting customer payloads or secrets in aggregate exports.

Decision:
- pair only independently bound identical held-out cases;
- use a predeclared contemporaneous design for unpaired live outcomes;
- preserve cancellations, denials, partial/failed and unknown outcomes;
- missing evidence, insufficient sample, tied quality, broken accounting or unbound policy yields INCONCLUSIVE;
- any prohibited authority/safety violation stops evaluation and triggers the existing rollback path when applicable;
- IMPROVED requires the approved practical gain, uncertainty criterion and second locked confirmation window.
Avoid executing a mutating operation twice merely to create paired evidence.

## Essential acceptance tests

1. Missing project, dataset/version, evaluator, mode, candidate, rollback or budget rejects execution.
2. Cross-project dataset access, expired authorization, evaluator identity matching the proposing agent and unsupported mode reject execution.
3. Synthetic or testing-schema evidence never contributes to a live improvement claim.
4. Training/held-out overlap, duplicate case hash, missing paired side, stale version and evaluation before locked policy reject evidence.
5. Repeated terminal capture and delayed verification remain idempotent; failed/cancelled/pending runs stay in the denominator.
6. A tie or zero evidence renders INCONCLUSIVE; absent agent/mode groups render unmeasured.
7. Budget exhaustion, missing provider accounting, timeout, authority violation or conflicting provenance suspends/stops evaluation.
8. Rollback requires current authorization, restores the referenced version and retains unfavorable evidence.
9. Command Center and evidence endpoints enforce actor/project authorization and remain read-only where designed.
10. Positive-case nomination follows existing Admin review and does not turn every successful run into a positive learning case.

Reuse the existing tests listed in the prospective evidence runbook. Add behavior tests only for new contract gaps. Run TypeScript checks and the affected learning/runtime tests. Execute migration reconstruction and isolated SQL fixtures only if a schema change is necessary. Record exact commit/check evidence; never edit released migrations.

## Environment and cost

Use the existing Dev/Test/Prod environment. Private testing schema is for disposable synthetic fixtures; isolated GitHub CI database is for migration rehearsal. Keep test flags/provenance explicit. Neither substitutes for real production outcomes.

No paid Supabase branch, new hosting service or repeated deployment is required for this preparation. Additional external evaluation spend remains zero until concrete caps are bound. Existing normal workloads may already incur provider costs; observing them is not proof that execution is free. Inspect actual provider accounting before launching additional workloads.

## 2026-10-01 runner-core update

The zero-spend readiness review found that candidate, policy, benchmark and budget services were not joined by a server-owned prospective runner. The focused runner-core implementation now adds durable case/arm/run preparation, pre-provider DISPATCHED commitment, ambiguous-resume blocking, append-only state transitions, and exact budget/cost binding before non-synthetic completion.

This does not complete a live experiment path. Provider execution, input replay, output artifact persistence, independent scoring and aggregate decision derivation remain separate implementation slices. Synthetic fixtures must stay segregated from canonical live evidence.

## Next executable actions

1. Read the project's actor-authorized inventory and existing runtime/evaluation contract surfaces.
2. Bind a representative project/dataset scope from existing authorized assets; identify the independent verification role and actual provider budget configuration.
3. Audit gaps between existing contracts and the activation record above, then implement only missing validation/reporting integration on a focused feature branch.
4. Run essential negative/failure-path checks and update this plan with exact evidence.
5. Collect normal baseline outcomes; propose an exact candidate only after verified failure patterns exist.
6. Present the complete experiment specification for the required candidate-release review, then execute its approved bounded evaluation.

No arbitrary candidate, evaluator identity, dataset permission, statistical sample or paid allowance is invented to bypass missing inputs. When an inventory cannot establish a required business value, report that exact unresolved field with a recommended choice.

## Double-check findings, 2026-09-30

Live read-only recheck: terminal coverage = 0; prospective outcomes = 0. No improvement claim is supported. At inspected PR head bdb07f94ec54654ec584b6f515f9eeefb4bf0275, build, analyze, CodeQL and database reconstruction checks succeeded; a Cloudflare container certification check remained in progress. Skipped checks are not passed tests. This is not an all-green claim.

The Planned labels above are intentional. Proposed rubrics, gain and sample guidance are not executable policy or calibrated evaluation. Implementation must prove:

1. Candidate release admission consumes the approved immutable experiment specification and rejects unset fields. Organizational evaluator independence, rubric calibration, sample adequacy and strictly positive gain need validation beyond the existing promotion eligibility gate.
2. The existing candidate >= baseline check permits ties. Review eligibility must remain distinct from measured improvement.
3. Cost and latency stop rules operate at the execution/release boundary with measured accounting. Missing accounting blocks candidate execution.
4. Reviewer identity resolves to an authorized actor for the exact experiment scope. A nonmatching identity string alone does not prove independence.
5. Safety disposition is separate from quality inference: prohibited safety/authority violations yield STOPPED or REJECTED regardless of quality score. INCONCLUSIVE must not neutralize a safety rejection.
6. Zero terminal coverage alone does not prove a broken trigger. Check new eligible traffic, provenance and delayed verification before diagnosing a collector defect.

These are explicit acceptance requirements, not completed code changes. No candidate was selected or activated by this review.
