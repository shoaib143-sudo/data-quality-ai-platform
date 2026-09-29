# Major Decision: Evidence-backed organizational maturity onboarding

Date: 2026-09-29

## Decision

Adopt an evidence-backed governance maturity onboarding model rather than a literal Yes/No questionnaire.

## Why

A binary questionnaire cannot distinguish informal practice, partial adoption, enterprise-wide operation, or continuously improved controls. It also permits a strong aggregate score to obscure severe control weaknesses.

## DataNexus model

Every applicable capability can carry:

* Current maturity, 0 to 5
* Organization target maturity
* Organization priority
* Evidence confidence
* Control coverage
* Multi-respondent consensus
* Criticality
* Risk contribution

The engine generates a prioritized roadmap from the gap between current and target maturity, weighted by capability importance, criticality, and organization priority.

## Evidence model

Assessment, evidence, and observation are separate records.

A self-declared answer is never overwritten merely because a later system observation differs. DataNexus preserves both and can surface the discrepancy. The v1 verifier reads connected metadata, quality-rule, lineage, and stewardship coverage and stores those results as independent system observations.

## Longitudinal model

Each reassessment is a new cycle. Historical scores remain reproducible against their recorded framework version.

## Source posture

The 2025 Broadband Commission Data Governance Toolkit is a primary source for coverage and question provenance. DataNexus maturity levels, scoring, target-state logic, verification mechanics, consensus analysis, and roadmap prioritization are product adaptations and must not be presented as official source-framework certification.

Implementation reference: `docs/governance-maturity-assessment-v1.md`.
