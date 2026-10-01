# Governed experiment budget deployment

Verified on 2026-10-01 in the existing Supabase project `tvjnavjxuehpesxcfvrx`. No separate project, paid branch, model call, or application release was created.

## Deployed change

The SQL from merged PR #1099, commit `6bdf1e4ec8987aa2d46734734fe68f1fabe2e8f8`, was fetched from GitHub and compared byte-for-byte with the reviewed migration before deployment. All existing composite identity constraints, canonical immutable-policy trigger, server-role bypass-RLS status, pricing access, and cost-event access were present.

`governed_learning_experiment_budget` was applied successfully to the existing database. It adds the immutable reservation and settlement tables and their two server RPCs. These canonical control-plane objects belong in `agent`; the synthetic-data boundary remains `testing`. Moving these objects to `testing` would break the merged runtime's schema and RPC bindings.

Verification established:

- RLS is enabled on both new tables.
- `anon` and `authenticated` cannot read either table or execute either RPC.
- `service_role` can select/insert, but cannot update/delete reservations or settlements.
- Both RPCs are `SECURITY INVOKER` with fixed `pg_catalog, agent` search paths.
- The actual service-role smoke test rejected a missing policy with `POLICY_NOT_FOUND` and a missing reservation with `RESERVATION_NOT_FOUND`.
- Both tables remained empty after those negative checks. No artificial evaluation outcomes were inserted.

The security advisor's `rls_enabled_no_policy` INFO notices for these two tables are intentional default-deny behavior for browser roles. Do not add public policies to silence them. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

The performance advisor identified missing composite foreign-key coverage for `(policy_id, project_id)` and `(reservation_id, project_id)`. Forward migration `20261001073345_learning_experiment_budget_fk_indexes.sql` supplies the two covering indexes, preserving released migration immutability. The original run-oriented index and unique settlement identity remain necessary. Fresh unused-index notices are expected while no experiment has run; they are not evidence that the indexes can safely be removed.

## Actual experiment readiness

The live database currently contains zero learning candidates, zero sealed benchmark dataset manifests, zero locked evaluation policies, zero evaluation results, and zero reviewed model-pricing versions. Its four current model registry entries are `DEMO_PROVIDER` models with lifecycle `DRAFT`. They are not verified billable backends.

The merged router intentionally requires a trusted server-owned quote adapter. No default adapter enables paid execution. Database deployment does not configure a provider, authorize a run, prove billing bounds, release a learned change, or demonstrate empirical improvement. Vercel/Cloudflare application release parity remains on hold.

## Concrete prerequisites for the first real pilot

1. Identify the authorized project, immutable dataset versions and a supported agent/skill in `GUIDED` mode. Seal the benchmark manifest with provenance and integrity evidence.
2. Register the actual provider/model and reviewed project-specific USD pricing through the existing governance path. Verify exact billing/token semantics, including reasoning tokens and fees, before supplying a conservative quote adapter.
3. Register a concrete candidate with distinct baseline/candidate versions and a rollback reference. Assign a genuine independent evaluator; do not fabricate evaluator identities or approval evidence.
4. Lock the rubric, calibration, analysis plan, sample size, score/gain thresholds, confirmation window and explicit total/per-run USD, token and latency budgets before collecting prospective outcomes.
5. Release the reviewed application implementation through the existing release process when the parity hold is lifted. Keep unsupported quote/backend combinations denied.
6. Collect paired prospective results, include every terminal outcome, and persist canonical cost evidence. Evaluate independently; synthetic fixtures stay separate from improvement evidence.
7. Submit only eligible evidence for existing approval, canary, verification, activation and rollback gates.

The current zero-spend synthetic stage is complete. A generic instruction to continue does not supply a real dataset, independent evaluator, verified billing contract, or an explicit positive experiment budget.

See [implementation contract](learning-experiment-budget-implementation-20261001.md) and [capability and activation decisions](../Major%20discussion/learning-experiment-budget-20261001.md).
