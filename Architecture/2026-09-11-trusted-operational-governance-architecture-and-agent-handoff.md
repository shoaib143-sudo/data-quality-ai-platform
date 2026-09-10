# DataNexus AI - Trusted Operational Governance Architecture and Agent Handoff

**Date:** 2026-09-11  
**Repository:** `shoaib143-sudo/data-quality-ai-platform`  
**Supabase project:** `tvjnavjxuehpesxcfvrx`  
**Implementation baseline before these documentation-only commits:** `main` at `0f8a76034960f3110b444f820863287abc95a38b`  
**Purpose:** Capture the architectural decisions and complete implementation handoff from the current working session.

---

## 1. Mission and architecture principle

The project began as an effort to transform DataNexus AI from a partially implemented data-quality/governance application into a production-verifiable AI Data Governance platform.

The critical profiling lifecycle is treated as a system-of-record chain:

`Dataset -> Dataset Version -> Profile Run -> Schema Discovery -> Profile Columns -> Metric Execution -> Metric Results -> Findings Generation -> Quality Score -> Governance Insights -> Validation`

The governing architecture principle became:

> Trusted platform foundation and operational governance product go hand in hand. There is no phase change where the foundation becomes trusted and the product is added later. A capability is complete only when functionality and trust are demonstrated together.

The product target is:

> Build a fully functional, operational AI Data Governance platform whose governance decisions, evidence, workflows, automation, AI reasoning, and runtime behavior are trustworthy in production.

---

## 2. Permanent engineering constraints

- Single-organization deployment model with dedicated data/infra boundaries.
- Preserve user work. Never use destructive git reset/checkout to discard unknown changes.
- Released migrations are immutable. Database changes are forward migrations only.
- Never place secrets in code, docs, commits, or responses.
- Never call a module complete without behavioral evidence.
- Authorization and action constraints are deterministic and must not be delegated to the LLM.
- AI recommendations must never silently become authoritative governance truth.
- Temporary patch workflows/helpers must be removed before release.
- Declared policy and runtime execution must match. A configured action that cannot execute is an implementation defect.

---

## 3. P0-P5 trust foundation completed earlier in the session

### P0 - certification and tenant/evidence boundary

Certification was moved behind governed RPCs and a database trust boundary. Direct catalog mutation of certification state is blocked. Live rollback-only verification demonstrated that direct `CERTIFIED` mutation failed with SQLSTATE `42501`, while governed request/review/approval succeeded.

Core RPCs:

- `governance.request_dataset_certification`
- `governance.review_dataset_certification`

### P1 - profiling integrity

Fabricated metadata-only profiling fallback was removed. Caller-provided row arrays are not accepted as trusted profiling evidence. Profiling uses trusted source access and evidence-linked run records.

### P2 - governed AI path

Applicable model invocation is routed through governed shared AI boundaries.

### P3 - governed retrieval

RAG is expected to remain permission-scoped, grounded, and citation-valid. Cross-scope retrieval and fabricated evidence paths are disallowed.

### P4 - CI/runtime proof

CI was expanded to cover security boundaries, migrations, TypeScript/build, profiling lifecycle, governance contracts, AI gateway/reasoning, retrieval permission/grounding, autonomy and fallback. Live-database evidence is kept distinct from CI when GitHub secrets are unavailable.

### P5 - worker isolation and capacity

`orchestration.claim_jobs_by_pool` introduced deterministic workload isolation for `CORE`, `SEMANTIC`, and `GOVERNANCE` pools with invalid-pool fail-closed behavior, concurrency caps, dependency/lease/retry checks, priority ordering, `SKIP LOCKED`, service-role execution, and batch limits.

Measured live database claim evidence was sub-millisecond on average, with invalid pool `22023` and concurrency cap tests passing. This evidence is database worker-pool claim latency/capacity evidence, not an HTTP end-to-end benchmark.

Final P0-P5 evidence was rebuilt from fresh main and merged through PR #189 after an older branch became stale. At that point the merged main SHA was `1c2f153b9bdee923d88f23280b178781aa2d471e`.

---

## 4. Product architecture reframing after P0-P5

The roadmap target is:

`Observe -> Understand -> Reason -> Recommend -> Govern -> Act -> Verify -> Learn`

The architecture review concluded that additional infrastructure was not the primary bottleneck. The next value comes from activating complete governance capabilities with real evidence and operational workflows.

Priority capability areas include governance knowledge, glossary mappings, policies/controls, CDEs, ownership/stewardship, classification approval, DQ rules/exceptions/anomalies/freshness, contracts/certification, field lineage, investigation, memory/feedback, evaluation and governed autonomy.

The business-governance relationship model is:

`Regulation -> Policy -> Control/Requirement -> Business Term -> CDE -> Dataset -> Column -> DQ Rule/Contract -> Owner/Steward`

AI may suggest classifications, mappings, risks and actions, but authoritative governance state requires deterministic policy and governed approval where required.

---

## 5. Best-practice optimizations adopted

The approach was reviewed against current DCAM/CDMC, NIST AI RMF/GAI, ISO AI/data-management guidance, OWASP GenAI/agentic security, and Google SRE principles.

The resulting architectural optimizations are:

1. P0-P5 are permanent invariants, not historical phases.
2. Delivery should use vertical trusted-capability journeys rather than isolated horizontal layers.
3. Governance controls should become a formal catalog with objective, owner, enforcement point, evidence, test, metric, failure response and review frequency.
4. Evidence classes must remain distinct: `Observation -> Derived Assertion -> AI Recommendation -> Human/Policy Decision -> Action -> Outcome`.
5. Lifecycle controls must include authoritative source, ownership, usage purpose, entitlement evidence, jurisdiction/sovereignty, privacy-impact triggers, retention/archive/purge and sensitive lineage.
6. Control burden should be risk-tiered by criticality, sensitivity, regulation, business purpose and downstream impact.
7. DQ states should explicitly distinguish `PASS`, `FAIL`, `NOT_MEASURED`, `UNAVAILABLE`, `ERROR`, `NOT_APPLICABLE`, and where appropriate `WAIVED`.
8. Agents operate inside a deterministic security envelope with allowlisted tools, scoped objects/projects, risk levels, approval requirements, validation and resource budgets.
9. Governance workflows need SLOs, not just infrastructure SLOs.
10. Continuous assurance is a product capability, with recurring reassessment of controls, agents, models, mappings and policies.

Canonical truth categories:

- `AUTHORITATIVE FACT` - database/catalog/governance truth
- `OBSERVED EVIDENCE` - profile metrics, rule results, lineage observations
- `DERIVED INTELLIGENCE` - anomaly, risk, AI hypothesis
- `GOVERNED DECISION` - approved classification, waiver, certification, accepted remediation or policy decision

AI can create derived intelligence. It must not silently create authoritative facts or governed decisions.

---

## 6. Vertical trusted journeys

The permanent CI model has evolved into:

- **V0:** trusted governance baseline
- **V1:** sensitive dataset governance journey
- **V2:** DQ incident journey
- **V3:** governed change-impact journey
- **V4:** governed investigation and eight-agent journey
- **V5:** governed action + outcome learning, currently in progress

V5 closes:

`governed recommendation -> policy decision -> approval -> execution -> verified outcome -> learning promotion -> later reuse`

The most important V5 trust rule is:

> Execution is not outcome. Outcome is not reusable learning until verified.

---

## 7. Current V5 state

### Repository state at handoff

Implementation baseline before documentation commits:

- main: `0f8a76034960f3110b444f820863287abc95a38b`
- V5 branch: `implementation/v5-governed-action-learning-20260910`
- V5 branch SHA: `bf3856a8ef5840a79589ec398e838bec9bf0c169`
- relation to implementation baseline: diverged, 15 commits ahead and 2 commits behind

The next agent must fetch current main and reconcile safely before release because documentation commits may have advanced main further.

### Existing V5 substrate

The system already contains:

- governed autonomy policies and action records
- approval workflow infrastructure
- idempotency
- durable profiling execution
- `agent.agent_learning_cases` reusable learning storage
- a governance memory provider that retrieves only active cases with `decision_status='VERIFIED'` and `outcome_status='VERIFIED'`

### Gaps discovered

1. The autonomy API used page-style redirecting auth and needed API-safe `requireApiUser`.
2. `REQUEST_REPROFILE` was a configured governed action but runtime execution supported only `CREATE_GOVERNANCE_ISSUE`.
3. Action execution had no first-class verified-outcome bridge controlling learning promotion.

Confirmed live `REQUEST_REPROFILE` policy:

- enabled
- `APPROVAL_REQUIRED`
- min confidence `0.85`
- max auto risk `HIGH`
- allowed target `DATASET_VERSION`
- non-reversible
- no production-source mutation

This authority must not be broadened.

### Current V5 substantive files

- `supabase/migrations/20260910225000_v5_governed_action_outcomes.sql`
- `lib/governance/governed-action-outcomes.ts`
- `lib/governance/governed-action-scope.ts`
- `lib/governance/governed-reprofile-action.ts`
- `lib/governance/governed-autonomy.ts`
- `app/api/governance/autonomy/route.ts`
- `scripts/verify-journey-governed-action-learning.mjs`
- `.github/workflows/p0-p4-revalidation.yml`

Temporary artifacts still present on the V5 branch and expected to be removed before release:

- `.github/workflows/temp-v5-action-scope-patch.yml`
- `scripts/patch-v5-action-scope.mjs`

### Intended V5 behavior

- real approved `REQUEST_REPROFILE` execution
- deterministic project/target/action scope checks
- API-safe auth
- first-class `governance.autonomy_action_outcomes` ledger
- before/after evidence
- verification from persisted trusted profiling records
- promotion into existing learning cases only after verified decision and verified outcome
- revocation/invalidation of learned outcome after rollback of an underlying reversible action
- `VERIFY_OUTCOME` API operation
- permanent V5 CI journey gate

Live profiling history confirmed terminal states:

- `COMPLETED`
- `PARTIAL`
- `FAILED`

The verifier must use trusted persisted profiling state and quality evidence, not caller-supplied success flags.

### V5 is not complete yet

Remaining work:

- fetch current main and reconcile/rebase V5 safely
- remove temporary V5 action-scope patch workflow/helper after confirming production changes are present
- inspect final diff for stale or accidental changes
- re-read migration and V5 services against live schema
- apply forward migration to live Supabase
- perform rollback-only/live normal, unauthorized/cross-project and failure/degraded tests
- run V5 journey verifier
- run cumulative V0-V5/P0-P5 security/regression gates
- TypeScript and production build
- release PR and exact-head CI verification
- merge only if evidence passes
- verify production deployment against exact merged SHA

---

## 8. Trusted operational acceptance standard

A capability is complete only when it demonstrates:

- business outcome
- correct functionality
- authorization and policy
- evidence and provenance
- operational reliability
- security and abuse resistance
- required human workflow
- auditability
- measured outcome

Each critical journey should be exercised through:

- normal path
- unauthorized/adversarial path
- failure/degraded path

AI/RAG tests should include malicious retrieved documents, indirect prompt injection, cross-project retrieval attempts, fake citation attempts, excessive tool requests and poisoned memory.

---

## 9. Transfer prompt for the next implementation agent

```text
You are continuing active implementation work on DataNexus AI / Data Governance PowerHouse. Perform actual repository and Supabase changes, not roadmap-only discussion.

Repository: shoaib143-sudo/data-quality-ai-platform
Supabase project: tvjnavjxuehpesxcfvrx
Implementation baseline before handoff documentation commits: main 0f8a76034960f3110b444f820863287abc95a38b
V5 branch: implementation/v5-governed-action-learning-20260910
V5 branch SHA at handoff: bf3856a8ef5840a79589ec398e838bec9bf0c169
At that baseline the V5 branch was 15 commits ahead and 2 commits behind main. Fetch current refs first because documentation commits may have advanced main.

Mission:
Finish V5 - Governed Action + Outcome Learning - while preserving all P0-P5 and V0-V4 trust invariants.

Product principle:
Functionality and trust are one deliverable. Authorization, evidence, policy enforcement, AI grounding, workflows, runtime behavior, audit, failure handling and outcome verification are part of each capability.

Truth model:
AUTHORITATIVE FACT = DB/catalog/governance truth
OBSERVED EVIDENCE = metrics/rule results/lineage observations
DERIVED INTELLIGENCE = risk/anomaly/AI hypothesis
GOVERNED DECISION = approved classification/waiver/certification/remediation/policy decision
AI never silently promotes derived intelligence into authoritative fact or governed decision.

Permanent constraints:
- no cross-project/cross-tenant evidence path
- no fabricated profiling evidence
- governed model/reasoning and permission-scoped grounded RAG remain intact
- API boundaries use API-safe auth
- authorization/tool/action limits are deterministic, not model-decided
- released migrations are immutable; forward migrations only
- preserve user work; no destructive reset/checkout
- no secrets in commits/docs/replies
- no completion claim without behavioral evidence
- temporary patch workflows/helpers must be removed before release

V5 target loop:
governed recommendation -> policy decision -> human approval where required -> execution -> trusted outcome verification -> learning promotion -> later validated reuse.

Critical rule:
Execution is not outcome. Outcome is not reusable learning until verified.

Existing substrate:
- governance.autonomy_policies and autonomy_actions
- approval workflows
- agent.agent_learning_cases
- governance memory provider retrieves only ACTIVE + VERIFIED decision + VERIFIED outcome cases
- durable profiling queue/runtime
- data_quality_scores linked to profile runs

Confirmed REQUEST_REPROFILE policy:
- APPROVAL_REQUIRED
- min confidence 0.85
- allowed target DATASET_VERSION
- non-reversible
- no production source mutation
Do not broaden it.

Current V5 substantive files:
- supabase/migrations/20260910225000_v5_governed_action_outcomes.sql
- lib/governance/governed-action-outcomes.ts
- lib/governance/governed-action-scope.ts
- lib/governance/governed-reprofile-action.ts
- lib/governance/governed-autonomy.ts
- app/api/governance/autonomy/route.ts
- scripts/verify-journey-governed-action-learning.mjs
- .github/workflows/p0-p4-revalidation.yml

Temporary artifacts still present and expected to be removed before release:
- .github/workflows/temp-v5-action-scope-patch.yml
- scripts/patch-v5-action-scope.mjs

Start now:
1. Fetch current main and V5 refs. Reconcile/rebase safely; preserve all branch and newer-main work.
2. Inspect exact diff. Remove temporary patch workflow/helper only after proving their changes are already in production files.
3. Re-read V5 migration/services against live Supabase schema. Do not edit released migrations.
4. Verify action/project/target scoping across dataset version, agent run, profile run, outcome and learning links.
5. Confirm autonomy API uses requireApiUser plus capability checks.
6. Confirm REQUEST_REPROFILE cannot execute before workflow APPROVED.
7. Confirm reprofile execution uses trusted source binding/durable profiling and never mutates production source data.
8. Apply the V5 forward migration after schema review.
9. Run live/rollback-only tests for normal, unauthorized/cross-project and degraded/failure paths.
10. Derive outcome only from persisted profile states COMPLETED/PARTIAL/FAILED and linked trusted quality evidence. Caller-supplied success is never authoritative.
11. Confirm only verified governed outcomes are promoted into agent_learning_cases and only VERIFIED/VERIFIED learning is retrievable.
12. Confirm rollback of a reversible action revokes/invalidate downstream learned outcome.
13. Run scripts/verify-journey-governed-action-learning.mjs, cumulative V0-V5/P0-P5 gates, TypeScript, security checks and production build.
14. Open release PR only after clean diff and evidence. Verify CI against exact PR head SHA.
15. Merge only if all checks/live behavioral evidence pass, then verify Vercel production deployment on exact merged SHA.

Required V5 evidence:
- execution != verified outcome
- approval cannot be bypassed
- cross-project links fail closed
- verification derives from trusted persisted records
- verified learning is reusable later
- unverified/failed/revoked outcome cannot become active learning
- rollback invalidates downstream learned outcome where applicable
- no production-source mutation
- V0-V4 and P0-P5 regression gates remain green

Do not spend the session repeating the roadmap. Begin with current ref reconciliation, diff review, temporary-artifact cleanup and live-schema verification, then carry the actual change set through release readiness.
```

---

## 10. Final architecture note

DataNexus AI should be judged by repeatable governed journeys, not self-assigned maturity labels. The next release is successful only when the system can prove what it observed, what AI inferred, what policy/humans decided, what action executed, what changed afterward, and why any resulting learning is safe to reuse.
