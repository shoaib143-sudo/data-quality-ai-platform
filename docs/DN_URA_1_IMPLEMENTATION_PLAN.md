# DN-URA-1.0 Unified Readiness Intelligence

## Decision

DN-URA-1.0 is the canonical DataNexus readiness architecture. It extends rather than replaces DN-GMA-1.0.

The system is evidence-first. Questions are fallback instruments used only when connected evidence cannot establish the required capability state or when human context is inherently required.

## Product principles

1. Default organizational onboarding establishes an initial Data and AI readiness baseline.
2. Non-applicable capabilities are excluded, never scored as zero.
3. Machine observations do not overwrite human declarations. Both remain attributable.
4. Score, confidence, consensus, critical gaps, and target state remain distinct.
5. Critical readiness gates cannot be hidden by aggregate averages.
6. Historical assessment snapshots remain reproducible against their framework version.
7. External frameworks are provenance/crosswalk inputs, not runtime dependencies or claims of certification.
8. Recommendations must trace to evidence and capabilities before they can become governed actions.
9. Authorization remains fail-closed and execution uses existing DataNexus governance boundaries.
10. Evidence freshness affects confidence. Contradictions are findings, not values to average away.

## Runtime architecture

Context Engine -> Capability Registry -> Evidence Engine -> Readiness Engine -> Lens Registry -> Action Engine -> Governed Execution -> Outcome Verification -> Evidence refresh.

The initial foundation deliberately keeps these as small composable modules. Persistence, observation adapters, UX, and action integration follow behind stable contracts.

## Canonical dimensions

Strategy & Business Value; Data Discoverability & Metadata; Data Quality & Master Data; Semantic Context & Knowledge; Accessibility, Integration & Freshness; Governance, Privacy & Security; Lineage, Provenance & Trust; AI Governance & Responsible AI; Observability & Operational Resilience; People, Operating Model & Adoption.

## Delivery streams

1. Capability registry and framework crosswalks.
2. Context, applicability, and deterministic minimum-question planning.
3. Evidence normalization, freshness, contradiction, confidence, and observation adapters.
4. Readiness scoring, gates, lenses, targets, and gap intelligence.
5. Onboarding/results/roadmap UX and governed action integration.
6. Persistence, migration, RBAC, negative/failure tests, accessibility, documentation, and release gates.

## Compatibility

DN-GMA-1.0 remains independently versioned and reproducible. Existing maturity records and scoring behavior must not change as a side effect of DN-URA. DN-URA may map to DN-GMA capabilities but must not rewrite historical DN-GMA answers or scores.

## Release gates

A change is not complete until type checking and focused unit/integration tests pass; critical failures cannot be averaged away; tenant and role boundaries fail closed; stale evidence cannot produce high-confidence readiness; N/A behavior is verified; historical DN-GMA behavior is regression-tested; and all generated actions preserve existing authorization/approval semantics.

## Deferred from foundation change-set

Database persistence and migration, production observation adapters, UI replacement, continuous event subscriptions, and governed execution wiring. These require the foundation contracts to stabilize first and will be delivered incrementally without direct production migration or deployment from this branch.
