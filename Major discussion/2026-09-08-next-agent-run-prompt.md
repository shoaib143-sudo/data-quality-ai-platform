# DataNexus AI next-agent run prompt

Copy the prompt below into another implementation agent with access to the project tools.

---

You are taking over active production engineering for **DataNexus AI**. You are expected to **run the work**, not merely plan it. Do not ask the user to repeat context already captured here. Inspect the live repository, Vercel deployment, Supabase schema/evidence, and other connected project tools before making claims.

## Operating mode

Work autonomously in this loop:

```text
inspect live state
→ identify exact gap
→ implement smallest truthful fix
→ focused tests
→ PR
→ repair CI until green
→ merge exact verified head
→ apply migration only when required
→ verify exact-main CI/deployment
→ production canary/evidence
→ continue
```

Stop only for a genuine external, technical, security, or human-authority blocker. When blocked, name the exact file/function/schema/object/permission and the evidence proving the blocker.

Never expose or hardcode secrets, PATs, service-role keys, JDBC credentials, bridge tokens, credential references, passwords, or credential-bearing URLs.

## Project coordinates

Repository:

```text
shoaib143-sudo/data-quality-ai-platform
```

Production app:

```text
https://data-quality-ai-platform.vercel.app/
```

Supabase project ref:

```text
tvjnavjxuehpesxcfvrx
```

Target DataNexus project:

```text
479813aa-72a4-4b12-b72a-74da8d2419ce
```

Databricks source:

```text
f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b
```

Vercel project ID:

```text
prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR
```

Vercel team ID:

```text
team_rHi9EXWHJwXXxejgVBYUJFJq
```

Generic JDBC bridge:

```text
service name: datanexus-jdbc-bridge
service id: srv-daeh498n74is73dqnskg
```

Checkpoint main SHA when this prompt was written:

```text
612698462804291c83b86d6d3ba7d7ee1134b1a4
```

**Do not assume this SHA is still current. Re-query `main` first.**

## Read these first

1. `Architecture/2026-09-08-datanexus-ai-e2e-operating-state-and-continuation.md`
2. `Major discussion/2026-09-08-datanexus-ai-e2e-progress-decisions-and-open-boundaries.md`
3. `Architecture/2026-09-07-production-operating-state-and-continuation.md`
4. `Architecture/2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`
5. `Architecture/2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`

## Non-negotiable truth boundaries

- source physical metadata is source-authoritative;
- DataNexus is authoritative for governance state, governed decisions, history and derived intelligence;
- observation is not governance/configuration authority;
- AI suggestion is not human/governed authority;
- inferred lineage is not source-observed lineage;
- human acceptance of inference does not make it source-observed;
- stable identity is preferred over mutable path identity;
- FK/REFERENCES structure is not transformation logic;
- scheduler DAG edges are orchestration dependencies, not data lineage;
- sampled profiling evidence must remain labeled sampled;
- profile reuse requires a strong source freshness fingerprint;
- incremental execution requires a source-observed change boundary;
- never fabricate ownership, classification, controls, lineage, transformations, approvals, remediation or quality evidence;
- never weaken RLS/security merely to make checks green;
- never delete failed evidence merely to make state look successful.

## Scoped Databricks E2E datasets

Exactly these two gold tables were used for final acceptance:

```text
pub.gold.customer_water_consumption_behavior_profile_metrics
pub.gold.customer_water_consumption_behavior_drift_metrics
```

Stable dataset IDs:

```text
profile: 858d8627-722b-4caa-a473-92ec594cafe5
drift:   232244ed-74c0-4b98-99da-d3d7f280efed
```

Governed v3 versions:

```text
profile: f55b8039-5777-4595-b128-59e3624e6dd4
drift:   ac7848a5-bc85-40a2-9944-04a5fe65bbda
```

Active execution-source IDs at the earlier checkpoint:

```text
profile: 48eee28f-947c-42a8-88d5-2b2685d3afc1
drift:   d86b4c72-2d9e-4126-b473-35f605404f7f
```

Re-query these before writes.

## Final two-table acceptance already completed

Do not rerun simply because you are taking over. Rerun only when needed to verify a new material change.

Latest coherent acceptance showed:

- both profiling jobs claimed event-driven in about 1.739 seconds;
- both profiling jobs succeeded first attempt;
- downstream DQ fan-out succeeded first attempt;
- drift: 1,000 rows observed, 22 columns, 12 findings, score 0.5455, 8 proposed rules, 0 enabled;
- profile: 1,000 rows observed, 29 columns, 17 findings, score 0.5494, 8 proposed rules, 0 enabled.

Do not say the 16 proposed rules were executed. They remain proposals unless governed approval enables them.

Sampling evidence is intentionally:

```text
coverage_scope = SAMPLED_OBSERVATION
planner_reason = UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE
full_source_coverage_claimed = false
```

Incremental eligibility is currently:

```text
FULL_OR_SAMPLED_REQUIRED
CHANGE_BOUNDARY_UNAVAILABLE
```

because the Databricks execution bindings do not carry an authoritative CDC/watermark boundary.

## Scheduler/profiling architecture already implemented

Do not rebuild these unless a live regression proves a need:

- event-driven durable queue wake-up;
- cron as recovery sweep;
- bounded parallel dispatch;
- queue/outbox convergence in bounded rounds;
- source-aware concurrency by governed `source_id`;
- AIMD adaptive source concurrency;
- workload characterization with explicit UNKNOWN evidence states;
- persisted `orchestration.job_dependencies`;
- dependency-aware claim blocking;
- truthful cancellation on failed required predecessor;
- critical-path weighting over persisted descendants;
- queue-wait/planner telemetry;
- truth-aware automatic sampling;
- truth-aware incremental eligibility;
- FILE/CSV strong-fingerprint profile reuse.

Measured production enqueue-to-claim is around 2 seconds rather than the earlier ~53-second cron wait.

## Evidence reuse boundary

FILE/CSV reuse is production-proven with actual source-byte SHA-256:

```text
content_hash_authority = SOURCE_BYTES_SHA256
reuse_fingerprint_authority = SOURCE_BYTES_SHA256
```

Databricks/JDBC reuse must remain disabled unless a real source-content/snapshot freshness fingerprint is added. `catalog.dataset_versions.content_hash` is not sufficient: promotion currently writes discovery `structure_hash` into it.

## Enterprise governance corpus is now real

The following INTERNAL documents were approved through the governed `policy.approve` path and are `ACTIVE/APPROVED`:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

They are approved non-synthetic enterprise material. Do not revert knowledge capabilities to bootstrap-only unless live evidence shows the documents are no longer approved/active.

## Capability #45 is genuinely evidenced

A real HIGH email-format defect in the governed CSV fixture was taken through approval, source correction, production deployment, fresh profiling, DQ re-execution and verification.

Result:

```text
before: 1 failed HIGH control
after:  0 failed controls
```

Verified remediation outcome:

```text
0929a3b1-eb1d-41fd-999d-122907af6261
```

PR #99 hardened the matrix so capability #45 counts only remediation outcomes with `status='VERIFIED'`.

## Current 75-capability matrix

At this checkpoint:

```text
72 EVIDENCED
3 DATA_PENDING
0 BOOTSTRAP_ONLY
0 NOT_EVIDENCED
75 TOTAL
```

The only remaining capabilities are:

```text
#31 Data lineage interpretation
#32 Impact analysis
#52 Agent based data architect
```

## Your first task: close or precisely prove the remaining lineage blocker

Do this before unrelated optimization work.

1. Re-query current GitHub `main`, Vercel production deployment SHA/status, and Supabase migration/evidence state.
2. Read the native Databricks lineage ingestion implementation and the current matrix evidence query for #31/#32/#52.
3. Inspect live `governance.lineage_column_mappings` and related lineage tables for the target project/two datasets.
4. Run the existing Databricks lineage enrichment/canary through the production contract.
5. Capture the exact Databricks response/error for `system.access.table_lineage` and `system.access.column_lineage`.
6. If access is now available, ingest only real source-observed lineage, preserve source evidence/provenance, run focused tests/contracts, and regenerate the matrix.
7. If access is still denied, do not fabricate mappings. Report the exact missing privilege/object and stop the 75/75 closure there.

Known blocker at this checkpoint:

```text
DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED
required privilege: USE SCHEMA on system.access
required source objects:
  system.access.table_lineage
  system.access.column_lineage
data blocker: REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
inference_allowed_as_source_authority = false
```

If the configured principal lacks table-level SELECT in addition to `USE SCHEMA`, report the exact grants required by the live Databricks error. Do not guess if the canary provides a more precise error.

## Expected evidence target

The remaining matrix capabilities depend on real field-level lineage evidence, including governed records such as `governance.lineage_column_mappings` as defined by the live schema/contracts.

Do not use any of the following as a substitute for source-observed field lineage:

- AI lineage suggestions;
- human acceptance of AI suggestions;
- scheduler `job_dependencies`;
- FK/REFERENCES structure alone;
- same-name column inference;
- manually inserted fabricated mappings.

## Major PR history for this phase

Relevant merged PRs:

```text
#76 Adaptive Scheduler v1
#77 AI Insights workspace
#78 75-capability Control Center
#79 capability #59 governance recommendations
#81 protected AI Insights evidence access
#82 current recommendation-count semantics
#83 event-driven queue wake-up
#84 event-driven outbox/DQ convergence
#85 source-aware concurrency and telemetry
#86 workload characterization
#87 persisted scheduler DAG
#88 unknown workload-size truth fix
#89 critical-path scheduling
#90 adaptive source concurrency
#91 planner service-role access + safe fallback
#92 automatic sampling
#93 sampled duplicate-metric scope fix
#94 FILE/CSV profile evidence reuse
#95 preserve source-byte hash authority
#96 incremental eligibility planning
#98 governed remediation source correction
#99 VERIFIED-only evidence for capability #45
```

## Production verification discipline

For every material change:

1. create a focused branch from freshly resolved main;
2. make the smallest change consistent with authority boundaries;
3. add/update permanent regression verification;
4. run focused workflow plus full Quality Gate;
5. repair failures rather than bypassing them;
6. merge only exact verified head;
7. apply Supabase migration only after merge/CI unless a migration is explicitly needed for pre-merge canary and is safely reversible;
8. verify exact-main Vercel deployment is READY;
9. run a production canary using real durable contracts;
10. verify runtime logs/evidence;
11. regenerate the capability matrix when evidence semantics change.

## Do not do these things

- do not restart the project from scratch;
- do not ask the user for information already in this handover unless live state disproves it;
- do not spend time re-proving scheduler optimizations unless relevant to a new defect;
- do not auto-approve DQ proposals;
- do not auto-promote unrelated datasets;
- do not call sampled observations full-source scans;
- do not enable Databricks evidence reuse from structure hash;
- do not claim incremental execution without an authoritative change boundary;
- do not turn orchestration DAG edges into data lineage;
- do not force 75/75 by weakening evidence criteria.

## Completion target

The next milestone is **75/75 EVIDENCED only if real Databricks source-authoritative field-lineage evidence becomes available and satisfies the governed contracts**.

If that external privilege remains unavailable, the correct completion state is 72/75 with a precise external blocker, while preserving all already-completed production E2E, governance, scheduler, sampling, reuse, remediation and AI-matrix work.

Proceed now. Use the connected tools and run the work.

---
