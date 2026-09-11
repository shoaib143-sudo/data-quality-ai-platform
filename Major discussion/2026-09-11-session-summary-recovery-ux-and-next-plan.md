# 2026-09-11 Major Discussion Summary: Recovery, Production Hardening, UX, and Next Plan

## Purpose

This document captures the major decisions, verification work, implementation progress, unresolved constraints, and product direction discussed on 2026-09-11 for DataNexus AI / Data Governance PowerHouse.

It is a discussion and decision record, not a certification artifact. Statements about recovery, readiness, RPO/RTO, or production state must continue to be supported by live evidence and the formal Recovery Assurance contracts.

## Executive summary

The platform has moved from broad feature construction into production hardening, operational assurance, recovery engineering, and user-experience consolidation.

The most important conclusions were:

- Recovery claims must remain evidence-driven and fail closed. A database schema that can be reconstructed is not the same as a restored platform, and a restored database is not the same as a fully recovered service.
- No paid Supabase recovery branch or other billable DR environment will be created without explicit approval. The current recovery direction is zero-additional-cost wherever possible.
- Recovery Assurance v2 is now a formal platform capability with policy, evidence, scope coverage, drill state, and RTO/RPO truth boundaries.
- PR #258 was merged to establish recovery source authority, including previously live-only Edge Function source and governed migration-history aliasing.
- PR #261 implements encrypted portable backup and local isolated restore tooling, but it is not yet merged. Its first merge attempt was correctly blocked because `main` advanced after another PR merged, which made #261 stale relative to protected branch checks.
- Main branch protection continues to require four gates: `build`, `analyze`, `revalidate`, and `certify`.
- The next major product concern is no longer only backend capability. From a user-experience perspective, DataNexus now needs a unified shell, task-based workflows, global search, a governance inbox, clearer project context, stronger async-job UX, consistent empty/error/loading states, and more coherent cross-module journeys.
- Two external-data blockers remain intentionally open: genuine field-level lineage transformation metadata and a genuine approved enterprise governance corpus. These will not be fabricated.

## Production and platform context discussed

The production architecture currently spans:

- Vercel for the Next.js application.
- Supabase for PostgreSQL, Auth, Storage metadata, Edge Functions, and governance persistence.
- Render for OPA, OpenTelemetry collector, and the JDBC bridge.
- GitHub Actions for protected quality, security, revalidation, certification, and recovery evidence workflows.

The production Supabase project is on the Free plan. That has important recovery implications: the design must not assume managed PITR or a paid standby branch is available. Portable logical export, encrypted off-provider retention, clean migration reconstruction, and local isolated rehearsal are therefore the current zero-cost strategy.

## Recovery Assurance v2 decisions

Recovery was decomposed into five layers:

1. **Recovery policy**: per-project RPO/RTO objectives, required scopes, drill cadence, freshness, and coverage expectations.
2. **Backup assurance**: provider backup/PITR status when available, portable logical export, Storage protection, and configuration/secrets inventory.
3. **Recovery rehearsal**: isolated restoration, database validation, platform reconstruction, dependency checks, and service smoke testing.
4. **Evidence**: durable drill records, SHA-256 manifests, commit/workflow references, provider identifiers, timing evidence, and scope coverage.
5. **Operational runbook**: incident classification, restore or rollback paths, cutover, validation, reconciliation, communications, and ownership.

The canonical recovery scopes are:

- `DATABASE`
- `STORAGE`
- `IDENTITY_CONFIG`
- `APPLICATION_CONFIG`
- `EDGE_RUNTIME`
- `DEPENDENCIES`
- `SERVICE_VALIDATION`

The canonical state progression is:

`NOT_CONFIGURED -> DOCUMENTED -> SIMULATED -> RECONSTRUCTED -> RESTORED -> PRODUCTION_VERIFIED`

The agreed truth boundary is strict:

- A successful migration replay can support `RECONSTRUCTED`.
- A real isolated database restore can support database-level `RESTORED` evidence.
- Full-platform `READY` or `PRODUCTION_VERIFIED` requires evidence across all required scopes, not only the database.
- The 60-minute RPO and 240-minute RTO are objectives until measured with authoritative recovery-point and service-ready timestamps.

## Production Recovery Assurance migration

Recovery Assurance v2 was applied to production Supabase.

Important operational nuance:

- Repository migration file: `20260912000000_recovery_assurance_v2.sql`
- Production migration registry entry was assigned a live timestamp when applied directly through the Supabase management path.

This difference must not be “fixed” by rewriting production migration history. Instead, migration-history aliasing and verification are used to make the divergence explicit and controlled.

All four current application projects have enabled recovery policies with:

- target RPO: 60 minutes
- target RTO: 240 minutes
- drill frequency: 90 days
- all seven canonical recovery scopes required

No successful full recovery drill has yet been recorded for those policies, so readiness remains correctly fail-closed.

## Source integrity and production evidence baseline

A production source baseline was captured after the Recovery Assurance migration. It included catalog, profiling, governance, semantic, audit, Storage metadata, and Auth counts, and confirmed the audit chain was valid at the time checked.

That baseline is inventory/source evidence only. It is not restore evidence.

The six required Supabase Edge Functions were verified as live. A critical gap was then identified: two live functions were not source-controlled. That gap was addressed in PR #258 so recovery no longer depends on dashboard-only source authority.

## PR #258: recovery source authority

PR #258, **Harden zero-cost recovery source authority**, was merged.

It established or strengthened:

- source control for the previously live-only `profiling-executor` and `connection-health-check` Edge Functions
- governed Supabase Edge Function configuration
- migration-history alias rules with an explicit `DO_NOT_REWRITE_PRODUCTION_HISTORY` policy
- a formal recovery business-impact-analysis baseline
- a portable-backup contract that retains the 60-minute RPO objective without claiming it is achieved
- fail-closed recovery source verification

Before merge, a CodeQL issue in `profiling-executor` was also fixed so raw exception or stack-derived details are not returned to clients.

## Best-practice re-verification

The recovery design was rechecked against current vendor and resilience guidance. The following principles were reinforced:

- Free-plan Supabase recovery should not assume paid PITR or standby branches.
- Supabase database backups do not recover Storage object bytes by themselves.
- Edge Functions and their deployment configuration must be version-controlled.
- Provider rollback is not full disaster recovery. For example, a Vercel deployment rollback does not restore external database state or provider configuration.
- GitHub Actions artifacts are useful evidence but have finite retention and should not be the sole durable record.
- Business impact analysis, recovery priorities, exercise cadence, and plan maintenance are required governance elements, not optional documentation.
- Restore paths must actually be exercised. A backup that has never been restored is not sufficient assurance.

The chosen direction is therefore a portable, encrypted, independently verifiable recovery path rather than a paper DR plan.

## PR #261: encrypted portable backup and local recovery rehearsal

PR #261, **Add encrypted portable backup and local recovery rehearsal**, was created to implement the next zero-additional-cost recovery increment.

It adds:

- Supabase CLI-based portable export for roles, schema, data, and migration history
- recipient-based `age` encryption
- SHA-256 evidence for encrypted and plaintext components before plaintext cleanup
- source-stability checks across the multi-dump export window
- deterministic recovery fingerprints for critical data and schema objects
- validation for RLS policies, functions, triggers, grants, extensions, and migration history
- a loopback-only local Supabase/Docker restore harness with explicit destructive confirmation
- post-restore comparison and governance audit-chain validation
- Git exclusions to prevent recovery artifacts from being accidentally committed

Security and truth boundaries remain explicit:

- production backup creation is forbidden on GitHub-hosted runners
- plaintext SQL is temporary and must be deleted after encryption
- the private `age` identity is never repository configuration
- no paid recovery environment is created
- the PR does not claim PITR, an authoritative recovery point, achieved 60-minute RPO, service-level 240-minute RTO, Storage object-byte recovery, off-provider copy completion, or full-platform `READY`

### Current #261 status at this discussion checkpoint

The exact-head CI for #261 had passed Recovery Assurance, CodeQL, P0-P5 revalidation, V6 certification, Quality Gate, and clean database reconstruction.

However, while #261 was open, `main` advanced when PR #262, **Pin native agent runtime and tool contracts**, merged. The first attempt to merge #261 was rejected by protected-branch enforcement because the protected checks were no longer valid against the new base.

At the time of this summary:

- `main` is at `edf99a8db32fc93a9813a64a203005a8a26f594a`
- #261 head is `b1d1629eb21e6d35b750abcf2598da0ad11d0555`
- #261 is 12 commits behind and 3 commits ahead of current `main`
- the branch must be synchronized with current `main`, conflicts checked, and the required protected checks rerun on the new exact head before merge

This is expected branch-protection behavior and should not be bypassed.

## Zero-cost recovery operating decision

The user explicitly rejected creation of the temporary paid Supabase branch.

The agreed zero-cost path is therefore:

- clean reconstruction from migrations for `RECONSTRUCTED` evidence
- encrypted portable production backup from a trusted machine or approved self-hosted runner
- independent integrity hashing and off-provider encrypted retention
- isolated local Supabase/Docker restore rehearsal
- deterministic validation of database contents and security/governance objects
- progressive evidence for non-database recovery scopes

A local restore must not be overstated as a complete cloud-platform recovery. It primarily proves the `DATABASE` recovery path and parts of platform reconstructibility.

## Remaining recovery work after #261

Once #261 is synchronized and merged, the next operational recovery steps are:

1. Run the first trusted encrypted production backup outside a GitHub-hosted runner.
2. Place an encrypted copy off-provider and retain checksum/provenance evidence.
3. Restore the backup into a local isolated Supabase stack.
4. Validate data fingerprints, RLS, functions, triggers, grants, migration history, extensions, and the audit chain.
5. Persist the resulting drill evidence without storing production data in GitHub.
6. Extend recovery proof to Storage, Identity/Auth configuration, Edge runtime configuration, Vercel, Render, external dependencies, and end-to-end service readiness.
7. Only after authoritative recovery-point and service-ready timestamps exist should measured RPO/RTO be evaluated against the 60/240-minute objectives.

## User-experience assessment

The platform now exposes a large amount of governance functionality, but the UX remains more module-centric than task-centric.

The executive dashboard currently exposes many workspaces, including Catalog, Glossary, Lineage, Stewardship, Classification, Remediation, Quality Rules, Schedules, Monitoring, Observability, Audit, Reports, Administration, Retention, Profiling Explorer, and AI Agents.

This demonstrates broad capability, but creates cognitive overhead. The next UX milestone should make the platform feel like one coherent product rather than a collection of powerful modules.

### UX priorities identified

#### P0: foundation

- **Unified application shell** across dashboard, role workspaces, catalog, quality, lineage, agents, and administration.
- **Task-based journeys** rather than requiring users to understand module topology.
- **Real global search** across datasets, glossary terms, policies, owners, lineage, issues, and agents.
- **Governance inbox / actionable notifications** for approvals, failures, findings, ownership requests, SLA breaches, and agent recommendations.
- **First-run onboarding** from role/project selection through first source connection, discovery, profiling, and interpretation.
- **Consistent loading, empty, partial-data, and error states**, with retry and human-readable messages instead of raw server failures.

#### P1: daily usability

- obvious project/organization/source context and switching
- role-personalized work queues such as “my approvals”, “my domains”, and “my incidents”
- cross-module continuity from finding -> column -> lineage -> owner -> issue -> policy -> remediation
- unified async-job progress experience
- AI trust UX showing evidence, confidence/limitations, approvals, execution state, and outcome
- formal WCAG 2.2 AA review
- deliberate responsive/mobile behavior for dense tables, lineage, filters, and approvals

#### P2: product maturity

- simpler terminology and reduced implementation language
- contextual help and explainability
- saved views, favorites, recent assets, pinned datasets, preferred domains
- product analytics for time-to-first-value, onboarding success, search success, approval latency, issue resolution, and journey abandonment

## Recommended UX Foundation increment

The recommended next product increment after the current recovery merge work is a **DataNexus UX Foundation** comprising:

- unified shell
- global search
- governance inbox
- project/context switcher
- standard loading/empty/error patterns
- guided onboarding

The user journeys should then be optimized around personas rather than modules:

- **Executive**: What is at risk and what needs my decision?
- **Data Owner**: What assets need my attention?
- **Steward**: What do I need to approve, classify, or remediate?
- **Engineer**: What broke, why, and what is impacted?
- **Governance/Risk**: Are controls working and where is the evidence?

## External-data blockers that remain intentionally open

Two production acceptance gaps are not implementation defects and must not be faked:

### Real field-level lineage transformation metadata

The ingestion engine, authorization, audit, graph persistence, transformation identity, field mapping, and agent consumption are implemented. What is missing is a genuine transformation artifact such as real SQL, dbt metadata, ETL mapping, Spark/Databricks job metadata, stored-procedure transformation, or BI semantic mapping.

Until such evidence exists, field-level transformation lineage must remain incomplete rather than synthetic.

### Real enterprise governance corpus

The governed knowledge intake, review, approval, semantic refresh, audit, retrieval, and pruning lifecycle is implemented. What is missing is at least one genuine enterprise-authoritative governance source with provenance and approval.

Bootstrap or synthetic material must not be relabeled as enterprise-authoritative merely to turn a gate green.

## CI and protected branch posture

`main` remains protected. The required status checks are:

- `Quality Gate / build`
- `CodeQL Security / analyze`
- `P0-P5 Revalidation / revalidate`
- `V6 Operational Certification / certify`

The operating rule remains: no protected merge should be forced merely because an older exact head was green. If `main` advances, the branch must be synchronized and the gates rerun.

## Immediate next actions

1. Synchronize PR #261 with current `main` while preserving the changes introduced by #262.
2. Re-run and verify all four protected checks plus Recovery Assurance and clean reconstruction on the new #261 head.
3. Merge #261 only after the synchronized exact head is green.
4. Perform the first trusted encrypted backup and local isolated database recovery rehearsal.
5. Begin the DataNexus UX Foundation increment, starting with unified shell, project context, global search, governance inbox, and consistent application states.
6. Keep the two external evidence blockers open until genuine source artifacts are supplied.

## Durable principles agreed during the discussion

- Do not fabricate recovery, governance, lineage, or enterprise evidence.
- Do not weaken RPO/RTO objectives simply to obtain a green readiness result.
- Do not equate deployment rollback with disaster recovery.
- Do not commit production backup data or secrets to Git.
- Do not use GitHub-hosted runners for plaintext production backup creation.
- Do not rewrite production migration history to make it look identical to repository filenames.
- Prefer reproducible source authority and infrastructure/configuration contracts over dashboard-only configuration.
- Treat user experience as a first-class architecture concern now that core platform capability is mature.
