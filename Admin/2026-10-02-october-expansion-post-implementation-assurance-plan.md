# October Platform Expansion — Post-Implementation Assurance Plan

Date: 2026-10-02
Scope: PR #1103 across metadata/catalog, lineage, observability, persona UX, AI fallback, job monitoring, BI/federation adapters, source-artifact scanning and notifications.

## Completion definition

Implementation is complete only when the same exact head passes: Quality Gate, Navigation Integrity, Persona Accessibility Acceptance, Persona Workspace Policy, Lineage Authority Integrity, Project Source Operational Readiness, CodeQL Security, Repository Governance, P0-P5 Revalidation, Post Implementation Assurance, Data Quality presentation contract, Job Monitor Domain Consistency and Production Security Posture. No Critical/High audit defect may remain.

## Revalidation plan

- Re-run all required CI on the final exact SHA; older-head evidence cannot close the change.
- Revalidate Admin/Owner persona preview and verify ordinary users cannot expand authorization.
- Revalidate DataNexus AI for missing route, provider timeout/error and malformed provider responses.
- Revalidate discovery, profiling, DQ and lineage-enrichment jobs through monitoring.
- Revalidate source connection health separately from metadata-scan health.
- Revalidate metadata history, proposal approval, idempotent apply and version creation.
- Revalidate lineage correction approval before mutation and human-approved evidence after apply.
- Revalidate persona-gated XLSX export using persisted lineage only.
- Revalidate federation conflict detection and deterministic authority resolution while preserving provenance.
- Revalidate durable metadata/lineage stakeholder alerts when notification flags are enabled.

## Independent adversarial audit

Authorization attacks: cross-project projectId/datasetId/sourceId substitution; workflow/history ID substitution; APPLY before approval; non-admin persona URL switching; read-only persona mutation attempts.

Lineage attacks: guessed name-based mappings; unapproved corrections; duplicate replay; stale transformation versions; unauthorized XLSX export; source==target corrections.

Metadata attacks: direct mutation without approval; conflicting federation records; lower authority replacing DataNexus authority; stale restore; duplicate proposal replay; schema-drift alert duplication.

AI/observability attacks: missing provider; provider runtime failure; malformed JSON; telemetry without trace context; sensitive prompt/reasoning leakage; stale source health represented as live; missing infrastructure evidence; notification provider outage.

Queue attacks: duplicate idempotency key; retry exhaustion; dead/cancelled job; unknown job type; durable job without agent_run_id; stale polling response.

## Unit and integration testing

Unit: federation normalization/conflicts/authority resolution; BI provider normalization; source scanner patterns and false positives; schema diff; transformation diff; persona preview predicates; copilot fallback; notification categories; health normalization.

Integration: proposal→approval→apply→history→alert; lineage proposal→approval→apply→alert; discovery→revision→schema signal→lineage-enrichment queue; source registration→health evidence→observability; durable queue→monitoring API→Job Monitor; BI import→catalog→lineage; authorized/unauthorized XLSX export.

## Negative and failure cases

1. Invalid UUID returns 400 with no mutation.
2. Missing resource returns 404 without leakage.
3. Cross-project access returns 403.
4. APPLY before APPROVED returns 409.
5. Duplicate APPLY remains idempotent.
6. Provider outage returns degraded governed evidence rather than fabricated content.
7. Incomplete discovery publishes no catalog revision.
8. Unsupported connector returns explicit capability error.
9. Notification failure remains durable/retryable.
10. Source artifact above 5 MB returns 413.
11. Unsupported provider/artifact returns 400.
12. Empty federation payload returns 400.
13. Lineage source==target returns 400.
14. Unauthorized lineage export returns 403.
15. Missing migration/table degrades explicitly where designed and fails closed otherwise.

## Gap register from double-check

### G1 — Live BI vendor extraction (Medium)
Current capability imports exported Power BI/Tableau/Looker metadata. No live vendor API extraction is implemented. Adapter boundary exists; activation requires vendor credentials/API configuration.

### G2 — Automated source-artifact acquisition (Resolved for GitHub / private-repo credential boundary)
The source-artifact workbench now supports bounded automated GitHub repository acquisition with artifact-type inference for .NET, Node.js, VBA, Macro, Script and Log files. Scans are capped by file count, per-file bytes and aggregate bytes; only github.com/raw.githubusercontent.com are used; source content is never persisted. Public repositories require no credential. Private repository scanning requires the server-managed GITHUB_SOURCE_SCAN_TOKEN.

### G3 — Continuous source heartbeat (Resolved implementation / activation controlled)
The scheduled worker can now enqueue idempotent hourly OBSERVABILITY heartbeats for ACTIVE/CONFIGURED sources. JDBC checks use governed credential references; FILE/CSV checks reuse governed source validation; failures persist redacted health evidence. Execution is opt-in through SOURCE_HEALTH_CHECKS_ENABLED to avoid unexpected external-system load or cost.

### G4 — Column-level manual lineage correction (Resolved)
Manual corrections now optionally capture source column, target column and transformation expression. The same approval workflow gates both the asset edge and the persisted column mapping, with project-scoped capability checks, idempotent identity and HUMAN_APPROVED_MANUAL authority.

### G5 — Metadata restore approval semantics (Resolved)
Restore now starts the catalog metadata approval workflow and cannot call the restore RPC directly. Only an APPROVED workflow instance can apply the historic version, and the restore remains version-creating and auditable.

### G6 — Change notification activation (Operational)
Metadata/lineage notifications are implemented but environment-controlled and disabled unless explicitly enabled and provider routes are configured.

### G7 — Health evidence freshness (Resolved)
Connection-check evidence now receives an explicit freshness classification. HEALTHY evidence becomes STALE after SOURCE_HEALTH_STALE_AFTER_HOURS (default 24h), preventing point-in-time validation from being presented as current liveness.

## Closure rule

PR #1103 remains Draft until all exact-head required gates pass. G1/G6 may remain documented follow-on scope only if UI and documentation do not overstate those capabilities.

## Final showcase required in ChatGPT

After implementation and exact-head assurance complete, present a closure report in the conversation containing:

1. Final exact commit SHA and PR state.
2. Implementation scope completed, grouped by the five workstreams.
3. Required CI/gate matrix with run IDs and conclusions.
4. Unit and integration test evidence summary.
5. Negative/failure-path test matrix with actual outcomes.
6. Independent adversarial audit findings, including attempted attacks and observed controls.
7. Migration/revalidation evidence.
8. Remaining gaps categorized as:
   - resolved before closure;
   - accepted follow-on implementation;
   - credential/access boundary;
   - production activation boundary.
9. Any known limitations or claims that must not be overstated.
10. Final recommendation on whether the branch is ready for review, while leaving merge/deployment as an explicit user approval boundary.

The final showcase must distinguish code implemented on the feature branch from changes merged or activated in production.
