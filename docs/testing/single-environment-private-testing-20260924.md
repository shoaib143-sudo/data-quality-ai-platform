# DataNexus single-environment Dev/Test/Prod contract

**Environment decision:** The existing DataNexus Supabase project and existing deployment are the only Dev/Test/Prod environment. Do not create a Supabase database branch, clone operational data into testing, spin up a second paid environment, or turn on additional production deployments just to run a test.

## Private database fixture boundary

The private `testing` schema is present in the current Supabase database, with its actual applied migration recorded as `20260923193808_create_private_testing_schema_and_fixture_harness`. The matching idempotent SQL is version-controlled in `supabase/migrations/20260923193808_create_private_testing_schema_and_fixture_harness.sql`. It has:

- `testing.fixture_runs` for synthetic mode-tagged suite/scenario/status/evidence records;
- `testing.fixture_assertions` with run-scoped unique assertion keys and a cascading FK;
- RLS enabled on both tables; no schema USAGE or table access for `anon` or `authenticated`; backend `service_role` has narrowly scoped fixture-table DML only.

A `testing.fixture_runs.status = 'PASSED'` is **only fixture-test success**. It does not grant approval, set a canonical capability ledger state or establish independent E2E certification. Do not populate this schema with real credentials, personal records, copied operational tables, signed human decisions or production test-job identifiers that would be mistaken for real run evidence.

## Repeatable live smoke

`Testing/sql/private-testing-schema-smoke.sql` checks private access, enabled RLS, all four canonical mode values, invalid mode and non-synthetic rejection, unique assertion enforcement, invalid assertion result rejection and FK protection. It begins an explicit transaction and ends with **ROLLBACK**; the only insert targets are `testing.fixture_runs` and `testing.fixture_assertions`. Execute it as an authorized database administrator against the existing project. The repo CI test `scripts/test-private-testing-schema-contract.mjs` checks that these isolation/rollback contracts have not been weakened and runs without database credentials.

On 2026-09-24 the live rollback smoke was executed successfully. It returned one synthetic fixture for each of `OFF`, `GUIDED`, `GOVERNED_AUTO` and `FULL_AUTONOMOUS`. A subsequent read verified **zero** persisted rows under the `rollback_smoke` suite key. Four earlier persistent records under `single_env_db_isolation_smoke_20260924` intentionally document the fixture-schema contract only, and explicitly set `not_e2e_certification=true`.

## What testing schema does not isolate

A schema has shared compute, WAL, triggers, extension configuration, background workers, secrets, resource budgets, rate limits, tables in other schemas, GitHub Actions, Supabase Auth and external Databricks/R2/Vercel services. Application code still writes operational evidence to its authoritative schemas. Merely setting `search_path=testing` does **not** safely redirect the entire governed E2E. Never treat synthetic fixture PASS as proof of live multi-service behavior.

**Operational guardrails:**

1. Isolate DB-only synthetic positive, negative, failure and access-control fixtures inside `testing`, preferably with transaction rollback. Never truncate operational datasets or reset shared policy/approval state to clean up a test.
2. For application integration, prefer mock external adapters and read-only authoritative checks before any real writes. Explicitly limit worker queues, API credentials, data volumes, retries and spending; forbid synthetic actors from appearing as real human approvers or certifiers.
3. Before real E2E execution in this shared environment, identify the exact authorized project, real operator and independent reviewer, server-enforced source scope, current policy/budget/stop state, runtime dependencies and expected side effects. Use a user-confirmed small scope. **No unattended automatic run, budget increase, approval, remediation or deployment** is authorized by this test-harness change.
4. Keep unrelated merges off the release critical path. Use GitHub PR reviews and exact-head checks, then deploy deliberately, verify the real signed-in user journeys and record actual persisted evidence. PR #1039 (GUIDED) and stacked draft PR #1040 (other modes) must not be described as deployed while they remain unmerged.
5. For a fully canonical E2E PASS, preserve the existing requirement of 75/75 truly executed and independently verified capabilities with a genuine independent assessment. A narrower goal may finish without a full canonical PASS, but should not be labeled as one.

## Release evidence ledger

- Existing `testing` schema: verified in the shared Supabase project with RLS and explicit private ACL.
- Synthetic schema contract: actual successful positive and adversarial fixture test; four mode-tagged fixtures stored.
- Rollback smoke: actual successful execution, zero residual test rows for the `rollback_smoke` suite.
- GitHub feature implementation, CI and independent review: track actual PR #1039 and #1040 heads rather than treating fixture evidence as release approval.
- Live end-to-end production sign-in / cross-service execution: **not performed by this database harness**.
