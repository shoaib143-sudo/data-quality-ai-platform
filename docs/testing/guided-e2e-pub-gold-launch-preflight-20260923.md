# GUIDED E2E: real-user launch preflight — PUB Gold

**Status:** Staged, NOT AUTHORIZED TO START. This is a live-evidence checklist, not an assertion of completed testing.

**Target:** DataNexus project `479813aa-72a4-4b12-b72a-74da8d2419ce`, Databricks PUB source `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`, current source scope v4 `dd2f6378-6067-4a4b-8145-fac5ff047164`. Exactly these five tables are selected:

1. `pub.gold.customer_water_consumption_behavior`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`
3. `pub.gold.customer_water_consumption_behavior_profile_metrics`
4. `pub.gold.test`
5. `pub.gold.water_quality_compliance`

## Preflight evidence, 23 September 2026

- Scope v4 is ACTIVE; the immutable `scope_hash` is populated and the native selection is SELECTED, with five qualified names. Preserve the original selection. The outer `scope_mode` is DYNAMIC; the exact current native-selection list is authoritative for this test.
- All five tables have current asset discovery records. **That does not prove successful discovery of the CURRENT scope version.**
- Drift/profile metrics: ACTIVE datasets, latest AVAILABLE versions, active JDBC execution bindings. Authoritative `catalog.verify_dataset_version_profile_readiness` currently blocks both with `DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE`.
- Consumption behavior, test, compliance: current discovered assets, but no registered datasets. Three pre-existing AI promotion recommendations are RECOMMENDED, not human-requested or human-approved. **Never fabricate approval or mark them AVAILABLE by bypassing the promotion workflow.**
- Required six v1.0 specialist definitions are enabled.
- Orchestrator policy is OFF / disabled, emergency stop true. All seven autonomy action policies remain disabled.
- Existing Business and Governance approval-authority assignments: three per axis, but zero active project-role bindings; verify each intended participant's actual signed-in access and project binding.
- Draft #1037 resolves step-local pinned contract mismatch; #1039 adds the exact on-screen GUIDED journey, snapshot-based five-table attachment, resumed scope revalidation and current profiling readiness checks. Require passing exact-head CI, review, deployed-code parity before the real-user test.

## Preparation sequence (no governance execution yet)

1. **Source owner or Data Custodian:** perform a fresh authenticated discovery for the ACTIVE v4 PUB Gold scope and verify successful, complete, non-truncated, zero-failure evidence; run the authoritative readiness RPC again. A historic discovered-asset row is not sufficient.
2. **Data Steward and authorized human approver:** use DataNexus Discovery / Catalog to request and decide the three pre-existing promotion recommendations as genuine user actions. Promote approved assets through the existing `catalog.promote_approved_asset` workflow; verify each resulting ACTIVE dataset, latest AVAILABLE version and active JDBC profiling execution binding. No direct SQL bypass of promotion.
3. **Data Governance Admin:** confirm the test account has `admin.manage` and `agent.execute` for the target project. Independently check current BUSINESS / GOVERNANCE approver access and independent `certification.review` reviewer. Avoid letting one testing account approve its own request or self-certify.
4. **Engineering release reviewer:** independently review draft #1037 and #1039, require their exact-head regression / adversarial / negative / TypeScript / quality CI checks and Vercel preview UI tests. Do not merge unrelated PRs or trigger production flood.
5. **Pre-run operator:** verify zero active/orphaned governance runs, exact five-table current scope, fresh source read/credential validity, no inadvertent project-wide dataset attachment, and that the new UI presents seven actions and real statuses. No evidence should be asserted without a canonical ledger.
6. **At user test start, not before:** signed-in authorized Admin deliberately selects and saves GUIDED, checks risk/budget/tool/agent limits, lifts emergency stop only under the established operating procedure and submits the exact goal. The application must block stale scopes and missing evidence.
7. **Human-in-the-loop:** genuine authorized BUSINESS / GOVERNANCE decisions where the risk policy requires them. Preserve goal hash, pinned source version/IDs, policy version and independent certification.
8. **Pass criteria:** canonical run-owned 75/75 executed and 75/75 independently verified, genuine approvals where required, correct five-version attachment, independent `PASS` and complete user-visible stage progression. Failure cases must remain blocked, not reported as success.

## Do not perform during preparation

Do not lift the emergency stop; merge/deploy live runtime without release verification; spoof users or approvals; insert AVAILABLE dataset versions by bypassing asset promotion; label old failed run evidence as GUIDED; execute FULL_AUTONOMOUS or GOVERNED_AUTO; or infer Databricks access from catalog metadata.
