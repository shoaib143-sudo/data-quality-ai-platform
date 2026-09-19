# September 19 Frozen Baseline, Profiling, Recovery, and Runtime Decisions

**Date:** 2026-09-19  
**Status:** Durable decision record

## Requirements freeze

The DataNexus implementation baseline is frozen.

This is a freeze on requirement change, not an instruction to implement every idea captured during analysis. No new requirement, enhancement, optimization, architecture extension, or scope modification is introduced unless explicitly reopened and approved.

A governance-document assessment produced 35 enhancement candidates. Those candidates remain **PENDING APPROVAL**. They must not be treated as approved frozen requirements.

Approved frozen implementation can continue autonomously through code, tests, defect fixes, production hardening, reconciliation, and certification.

## Approved core objective

The approved profiling objective is the complete governed lifecycle:

Dataset -> Dataset Version -> Profile Run -> Schema Discovery -> Profile Columns -> Metric Execution -> Metric Results -> Findings Generation -> Quality Score -> Governance Insights -> Validation.

The two principal acceptance paths are:

- CSV/file upload through the governed UI/source path;
- database-table profiling against a real disposable table.

The implementation must preserve readiness gates rather than bypassing catalog/source prerequisites.

## Source-onboarding boundary

Source onboarding owns:

Dataset Registration -> Dataset Version Management -> Source Configuration -> Source Connectivity -> Source Validation -> Schema Availability -> Profiling Ready.

It does not own the profiling execution engine, metrics, findings, scoring, or governance-insight execution.

JDBC MVP scope includes database platforms such as Databricks Unity Catalog, Microsoft SQL Server, and PostgreSQL.

## Profiling production-validation reconciliation

PR #768 represented final exact-main production-certification work. During reconciliation, its key production-validation files were verified byte-equivalent to files already on `main`, and current `main` already contained the production-validation workflow and quality-gate wiring.

The PR was therefore closed as duplicate integration risk rather than re-merging already integrated code.

This preserves the rule that repository truth is determined from current `main`, not from an older chat or PR description.

## Closed-loop recovery completion

The accepted recovery scope from PR #750 was cleanly restacked onto the frozen baseline as PR #780.

PR #780 merged after the observed exact-head validation suite passed. The superseded #750 branch was subsequently closed.

The recovery contract preserves these decisions:

1. P0/P1 repair may be authorized only through the governed deterministic boundary.
2. P2+ behavior remains protected from autonomous repair.
3. Repair claims are atomic/idempotent.
4. Repair and validation evidence is durable.
5. Concurrent claims are rejected safely.
6. Crash recovery fences stale workers.
7. PROFILING, DISCOVERY/metadata scanning, and DATA_QUALITY restart the failed durable job from its beginning.
8. Successful sibling/upstream durable jobs remain preserved.
9. Resume occurs from the nearest valid durable boundary, not an unreliable intra-job processing checkpoint.

This restart model is intentional for large metadata/data workloads where maintaining exact intra-job checkpoints can be less reliable than replaying the failed durable job.

## Exact-head certification

Certification is SHA-specific.

Any commit after certification creates a new candidate that must satisfy the applicable checks again. Historical green evidence may explain provenance but must not be presented as exact-head certification for a different SHA.

Required evidence includes relevant unit/integration tests, negative and failure cases, regressions, lint/type checks where applicable, migration validation, build validation, governance/security checks, and production certification where required.

## Runtime v2 continuation

Agent Policy v2 and Agent Runtime & Execution Orchestration v2 remain an approved implementation objective as a production-ready governed execution platform.

Current work includes governed agent lifecycle, runtime evidence/monitoring, recovery, authorization, execution controls, and provider/runtime resilience where already inside the approved runtime scope.

This does not approve unrelated governance-product enhancements.

## Vercel, Cloudflare, and R2 continuity decision

The selected operating direction remains active-passive:

- Vercel: primary production web runtime;
- Cloudflare: secondary canary/DR and future heavy execution target;
- R2: provider-neutral large-object storage direction;
- Supabase: database, auth, queue/control state, and scheduler authority;
- GitHub: source, CI, governance checks, and exact-SHA release authority.

Cloudflare is an alternative continuity/runtime path, not a forced Vercel replacement.

Provider-neutral preparation and R2 hardening are approved. Paid Cloudflare activation and destructive/global production cutover remain explicit approval boundaries.

R2 migration must remain copy-and-verify before cutover. Source objects and dataset-version references must not be silently destroyed or rewritten during the copy stage.

## Open implementation versus pending enhancements

Approved work that can continue includes:

- source onboarding and profiling readiness;
- profiling execution and production validation;
- findings/scoring and approved governance-insight integration;
- approved UI/API lifecycle integration;
- closed-loop recovery and runtime hardening;
- R2/hybrid-runtime production hardening;
- end-to-end integration and exact-head certification.

The governance enhancement assessment remains separate and pending explicit approval. Examples include Governance Knowledge Layer, unified DQ rule registry, CDEs, business glossary extensions, issue/remediation workflow extensions, governance evidence graph, policy-impact analysis, governance maturity assessment, rule applicability, and exceptions/dispensations.

## Repository hygiene decision

When a newer current-main restack preserves an accepted implementation:

- validate the successor;
- merge only after required checks pass;
- close the stale source PR as superseded;
- do not maintain duplicate integration paths.

This was applied to recovery (#780 superseding #750) and profiling validation (#768 closed after confirming the implementation was already integrated).

## Current checkpoint

At the time of this record, protected `main` was observed at:

`afb1628987d50e0f61066e61932706381eaaa02b`

This SHA is a checkpoint only. Future agents must refresh live repository and runtime state before taking action.
