# October Platform Expansion — Assurance Decision Record

Date: 2026-10-02

## Decision

The expansion enters final assurance only after exact-head CI, adversarial revalidation, negative/failure-path coverage and gap reconciliation.

## Governance boundaries

- Persona switching is presentation preview only and cannot expand authorization.
- Manual lineage correction is approval-gated before authoritative evidence is created.
- Metadata changes require governed approval before mutation.
- Restoring a prior metadata version is a metadata mutation and should follow the same approval boundary.
- DataNexus must not infer authoritative lineage from matching names.
- Lower-priority federated metadata remains preserved as provenance when canonical authority is selected.
- Notifications remain opt-in until routes/provider configuration are validated.
- No production merge or activation is implied by assurance success.

## Final acceptance evidence

Closure must record the exact SHA and successful runs for Quality Gate, Navigation Integrity, Persona Accessibility, Persona Workspace Policy, Lineage Authority, Source Readiness, CodeQL, Repository Governance, P0-P5, Post Implementation Assurance, Data Quality presentation, Job Monitor consistency and Production Security Posture.

## Final pre-assurance implementation decisions

The final safe implementation pass resolved three previously open implementation gaps before exact-head validation:

- Manual lineage corrections now support optional source-column to target-column mappings and transformation expressions. The same approval workflow gates both the asset edge and column mapping; writes remain project-scoped and HUMAN_APPROVED_MANUAL.
- Source health now has an opt-in recurring durable heartbeat. Scheduled checks reuse governed credential references and source validation, persist redacted evidence, and remain disabled unless SOURCE_HEALTH_CHECKS_ENABLED=true to avoid unexpected external-system load.
- Source-artifact scanning now supports bounded GitHub repository acquisition with automatic type inference for .NET, Node.js, VBA, Macro, Script and Log artifacts. Public repositories need no credential; private repositories use only the server-managed GITHUB_SOURCE_SCAN_TOKEN. Source content is not persisted.

Live Power BI/Tableau/Looker API extraction remains an external credential/API activation boundary. Existing exported-metadata normalization, governed catalog persistence and source-to-report lineage must not be described as live vendor extraction until those provider connections are configured and validated.

The feature branch must remain frozen during exact-head assurance. Any new code or documentation change after a successful gate invalidates that gate evidence and requires another full exact-head revalidation.
