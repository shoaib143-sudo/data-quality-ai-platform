# DataNexus Governance Maturity & Readiness Assessment v1

Status: implementation baseline complete on feature branch.

Framework version: `DN-GMA-1.0`

## Purpose

Create an organizational onboarding experience that converts governance self-assessment into an evidence-backed, explainable baseline and a prioritized DataNexus improvement roadmap.

The assessment is not regulatory certification, legal advice, or an official score from any referenced external framework.

## Design

The implementation preserves six primary domains:

1. Vision & Purpose
2. Principles
3. People & Accountability
4. Practices & Controls
5. AI & Emerging Technology
6. Capacity & Literacy

The source question set is adapted into six behavioral maturity levels from 0 to 5. Conditional questions are activated by organization context such as personal-data processing, external sharing, cross-border transfer, and AI use.

## Separate truth layers

DataNexus does not collapse all assessment evidence into one number.

* Declared maturity records what respondents say.
* Supporting evidence is stored independently with its own verification state.
* System observations are stored independently and can be collected from the connected DataNexus estate.
* Control coverage is separate from maturity.
* Evidence confidence is separate from maturity.
* Assessment consensus is derived from multi-respondent variance.
* Critical gaps remain visible even if the aggregate score is high.

## Outputs

The scorecard exposes:

* Governance Maturity
* Target Maturity
* Evidence Confidence
* Control Coverage
* Assessment Consensus
* Risk Exposure
* Critical Gaps
* Prioritized Improvement Roadmap
* Domain scores
* Assessment completion
* Longitudinal assessment history

## Authorization

The canonical single-organization runtime remains authoritative.

* Any authenticated organization member can contribute their own assessment responses.
* Organization OWNER or ADMIN can configure organization context and target maturity.
* Direct browser access to maturity persistence tables is denied.
* The server-side service-role API performs organization-scope validation before reads or writes.
* Evidence additions and response updates emit governance audit events.

## Persistence

The implementation adds:

* `governance.maturity_assessments`
* `governance.maturity_assessment_responses`
* `governance.maturity_assessment_evidence`
* `governance.maturity_assessment_observations`

Historical assessments remain intact. Starting a new cycle archives the current assessment and creates a new assessment rather than mutating history.

## UX

The journey is:

Organization context → Quick baseline → Full adaptive assessment → Evidence → Results → Critical gaps → Prioritized roadmap → Reassessment

The quick baseline uses the highest-signal questions. The full assessment adds deeper and conditional questions without blocking access to DataNexus.

## Provenance

Questions adapted from the Broadband Commission Data Governance Toolkit carry explicit source and license metadata in the framework registry. DataNexus scoring, maturity levels, weighting, risk calculation, roadmap prioritization, and target-state mechanics are DataNexus product logic and are not represented as official Broadband Commission scoring.

## Validation

Run:

```bash
pnpm run verify:governance-maturity
```

The gate checks framework/version contracts, persistence isolation, API authorization boundaries, multi-respondent preservation, evidence separation, UX requirements, and TypeScript compilation.


## Automated verification v1

The organization administrator can run **Verify connected estate** from the results view. DataNexus records current coverage observations for:

* catalog metadata coverage;
* enabled data-quality rule coverage;
* lineage dataset coverage; and
* active stewardship assignment coverage.

If the instance has no projects or no datasets, verification returns a skipped state rather than representing absence of connected evidence as zero maturity. Machine observations increase evidence confidence and can supply control coverage, but they do not overwrite the respondent's declared maturity.
