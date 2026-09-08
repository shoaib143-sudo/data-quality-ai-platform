# DataNexus AI E2E progress, decisions, and open boundaries

**Date:** 2026-09-08

## Executive summary

DataNexus has completed a fresh production E2E run for the two scoped Databricks gold tables and now has 72 of 75 AI capabilities evidenced. The scheduler/profiling stack has been substantially optimized and production-proven. Enterprise governance corpus readiness and a real remediation-to-reprofile verification cycle are complete.

The only three remaining matrix gaps are field-lineage dependent and remain blocked on Databricks source-authoritative lineage access.

Current checkpoint `main`:

```text
612698462804291c83b86d6d3ba7d7ee1134b1a4
```

## User objective that drove this phase

The user expected a real DataNexus E2E execution for:

- `pub.gold.customer_water_consumption_behavior_profile_metrics`
- `pub.gold.customer_water_consumption_behavior_drift_metrics`

and an operational, evidence-backed 75-capability AI matrix rather than a static feature checklist.

That objective has now been rerun on the latest production stack and reconciled with governance evidence.

## Two-table E2E result

Stable governed versions:

- profile v3: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift v3: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

Latest acceptance outcome:

- both profiling jobs claimed event-driven in about 1.739 seconds;
- both profiling jobs succeeded first attempt;
- both downstream DQ jobs were automatically created and succeeded first attempt;
- drift: 1,000 sampled rows, 22 columns, 12 findings, score 0.5455, 8 proposed controls, 0 enabled;
- profile: 1,000 sampled rows, 29 columns, 17 findings, score 0.5494, 8 proposed controls, 0 enabled;
- no recommendation was auto-approved;
- DQ success with zero enabled rules must not be described as executing the proposed rules.

## Decision: sampled evidence must remain sampled

The source does not provide authoritative source cardinality/byte-size estimates for these tables. The automatic sampling planner therefore uses a bounded 1,000-row observation and records:

```text
SAMPLED_OBSERVATION
UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE
full_source_coverage_claimed=false
```

A production defect was found where duplicate metrics were labeled `FULL_DATASET` when the connector returned exactly its capped row count. PR #93 fixed the basis to use the persisted coverage claim rather than row-count equality.

## Decision: event-driven orchestration, cron only as recovery

The clean reference run showed about 34.5% of wall-clock time was scheduler dead time. The original worker also claimed multiple jobs but processed them serially.

The scheduler was progressively changed to:

- process independent jobs concurrently;
- wake on durable queue insert;
- converge queue and outbox work in bounded rounds;
- persist dependency edges;
- enforce dependency-aware claims;
- use critical-path weighting over persisted descendants;
- use stable source IDs for resource limits;
- adapt source concurrency from measured success/failure signals;
- record queue wait and planner telemetry.

Measured production enqueue-to-claim improved from roughly 53.5 seconds in a cron-bound canary to about 2.1 seconds event-driven. The final two-table acceptance observed about 1.739 seconds.

## Decision: persisted DAG is orchestration structure, not source lineage

`orchestration.job_dependencies` now stores real scheduler dependencies. A profile-to-DQ edge can be `SUCCESS`-dependent. Failed required predecessors cancel dependent children without consuming child attempts.

These DAG edges describe DataNexus execution dependencies. They must never be represented as Databricks/source data lineage.

## Decision: adaptive source concurrency uses governed source identity

Jobs sharing the same Databricks `source_id` are treated as sharing a source resource. The AIMD controller increases cautiously after clean evidence and decreases on adverse signals. The scoped Databricks source reached a governed concurrency limit of 4 during clean production history.

URLs, credentials and credential references are not used as scheduler identity.

## Decision: profile reuse requires strong source freshness evidence

`catalog.dataset_versions.content_hash` is not safe for Databricks freshness decisions because promotion currently stores discovered `structure_hash` there. Multiple governed Databricks versions can therefore share the same value even when source data freshness is unknown.

FILE/CSV is different: the loader computes SHA-256 from actual source bytes. FILE/CSV reuse is therefore allowed only under exact source-byte/schema/configuration/engine/sampling/metric-contract identity. Production canaries proved direct execution followed by `REUSED` evidence with `SOURCE_BYTES_SHA256` authority.

Databricks/JDBC profile reuse remains disabled until a real source-content/snapshot freshness fingerprint exists.

## Decision: incremental execution requires a provable source change boundary

No current Databricks execution binding contains a CDC token, monotonic watermark, partition boundary, or equivalent source-authoritative cursor.

The incremental planner therefore correctly reports:

```text
FULL_OR_SAMPLED_REQUIRED
CHANGE_BOUNDARY_UNAVAILABLE
```

It must not infer incremental safety from profile timestamps, schema hashes, source sampling or DataNexus execution time.

## AI Insights and 75-capability matrix

The AI Insights workspace is evidence-backed and explicitly separates suggestions from authority. Protected governance risk evidence is read server-side after project authorization.

The 75-capability Control Center is generated from governed evidence. Capability #59 counts current governance recommendation contexts rather than historical audit volume.

After the latest governance work, matrix state is:

```text
72 EVIDENCED
3 DATA_PENDING
0 BOOTSTRAP_ONLY
0 NOT_EVIDENCED
```

## Decision: enterprise policy authority requires approved non-synthetic corpus

Synthetic/bootstrap knowledge was deliberately not treated as enterprise policy authority.

Two INTERNAL documents were reviewed through the real `policy.approve` path and are now `ACTIVE/APPROVED`:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

This made enterprise governance knowledge readiness real rather than bootstrap-only and moved the policy-aware capabilities into `EVIDENCED`.

## Decision: capability #45 requires real remediation verification

The matrix previously counted any remediation outcome row for #45. That was too weak.

A real failing HIGH email-format control on the governed CSV fixture was taken through:

1. workflow `policy.approve`;
2. governed remediation issue/outcome creation;
3. independently reviewed one-row source correction in PR #98;
4. production deployment;
5. fresh profile against changed source bytes;
6. automatic downstream DQ execution;
7. tracked issue resolution with deployment evidence;
8. formal verification.

Observed result:

```text
before = 1 failed HIGH control
after  = 0 failed controls
```

Outcome `0929a3b1-eb1d-41fd-999d-122907af6261` is `VERIFIED`.

PR #99 changed capability #45 so only `VERIFIED` remediation outcomes count. #45 now has evidence count 1 from this real cycle.

## Remaining 3 capabilities

Only:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

remain `DATA_PENDING`.

The exact external blocker is:

```text
DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED
USE SCHEMA on system.access
system.access.table_lineage
system.access.column_lineage
REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
```

The evidence target is real source-observed field lineage in the governed lineage model, including `governance.lineage_column_mappings` where appropriate.

AI inference, human acceptance of inference, scheduler DAGs, FK relationships or fabricated mappings cannot clear this blocker.

## Security and governance decisions to preserve

- never expose secrets or credential-bearing URLs;
- never weaken RLS to clear an advisor warning;
- keep service-role-only planner/RPC access narrow;
- retain failed evidence and historical audit rows;
- do not auto-approve DQ recommendations;
- do not auto-promote unrelated assets;
- keep physical-source truth separate from governance authority;
- keep sampling scope explicit;
- keep reuse and incremental eligibility conservative when source freshness/change evidence is absent.

## What another agent should do next

Do not restart E2E profiling or scheduler optimization merely to prove already-proven work.

First re-resolve current main/deployment/schema. Then focus on the three lineage capabilities. Trace the native Databricks lineage ingestion code and run a live canary against the configured source. If the connector principal now has access to `system.access`, ingest real table/column lineage and regenerate the matrix. If access is still denied, stop and report the exact Databricks privilege/object failure.

Do not turn inference into source authority just to reach 75/75.
