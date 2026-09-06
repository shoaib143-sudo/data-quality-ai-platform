# Major Discussion

This folder is the durable repository for useful product discussions, decisions, rationale, examples, capability exploration, open questions, and implementation direction for DataNexus AI.

## Important boundary

This repository records project knowledge needed by future human contributors and AI agents. It does not store private model chain of thought or hidden reasoning.

## Product identity

**DataNexus AI**

**Positioning:** From Data Intelligence to Autonomous Data Governance.

## Current strategic direction

DataNexus AI starts as an AI powered Data Intelligence platform. As the platform builds trusted knowledge about the data estate and confidence in AI decisions, it progressively evolves toward an Autonomous Data Governance platform.

The current implementation has moved beyond isolated module delivery into production operating-state validation. Production non-lineage enterprise acceptance currently covers Modules #1, #2 and #4 through #15. Source-authoritative Module #3 lineage remains deliberately blocked by missing Databricks `system.access` permission rather than being filled with inferred evidence.

## Core principles

1. Support Data Engineers, Data Stewards and Governance users, Data Architects, Enterprise Leadership, and cross persona users.
2. Build for multi tenant operation.
3. Support all data source categories over time. Initial focus is CSV and database tables, followed by unstructured data and logs.
4. Treat policies, standards, procedures, regulations, and other governance documents as first class inputs.
5. Prioritise critical datasets, critical data elements, regulatory data, PII and sensitive data, financial data, customer data, and operational data.
6. Start with human guard rails and progressively increase AI autonomy as confidence, evidence, policy controls, and verification mature.
7. Design major operations so both the UI and governed AI agents can invoke them.
8. Preserve evidence, decisions, actions, outcomes, audit history, and verification for AI operated workflows.
9. Capture useful information broadly first. Reconcile and classify later without deleting historical ideas.
10. Show the underlying business issue, business impact, risk, recommended action, expected benefit, and measured outcome alongside technical findings.
11. Keep observation separate from governed authority and AI suggestions separate from human/governed decisions.
12. Never invent lineage, classification, ownership, policy, control, approval or remediation evidence to make a readiness state appear complete.

## AI autonomy model

1. Observe
2. Investigate
3. Recommend
4. Execute under human approval
5. Execute autonomously where policy and risk allow
6. Verify
7. Learn and improve

## Initial AI autonomy boundary

Safe to automate initially:

- Generate descriptions
- Suggest rules
- Classify columns
- Detect anomalies
- Generate profiling summaries

Human approval initially required for:

- Modify data
- Delete records
- Change schemas
- Execute remediation
- Change governance policies
- Alter production pipelines

AI-assisted lineage follows the same authority principle: metadata-derived candidates are suggestion evidence only. Human acceptance plus a separate governed promotion may create a human-confirmed inferred dependency, but this still does not become source-observed lineage.

## Major discussion index

- `2026-08-28-product-direction.md` captures the current product vision, AI capability direction, personas, criticality model, data source strategy, autonomy guard rails, and product naming decision.
- `2026-08-28-ai-capability-matrix.md` preserves the broad AI capability exploration, including 75 strategic use cases, concrete examples, business benefits, problem statements, AI contribution, prioritisation, governed autonomy, investigation, explanation, prediction, recommendation, remediation, verification, and agent capabilities.
- `2026-08-28-knowledge-capture-policy.md` defines the capture first, reconcile second rule and the requirement to preserve useful history, examples, alternatives, superseded ideas, and rejected approaches.
- `2026-08-28-session-summary-and-next-plan.md` records the prior session summary and implementation starting plan.
- `2026-08-29-reconciliation.md` records the confirmed priorities: CSV and database tables first, PostgreSQL / Supabase followed by Databricks, the Data Profiling Investigation Agent, an issue centric AI Operations Center, and business benefit measurement.
- `2026-08-30-reconciliation.md` records the next reconciliation checkpoint and confirms that no new product or architecture decisions were identified after the 2026-08-29 record.
- `2026-08-31-reconciliation.md` records the latest checkpoint. No new durable product or architecture decisions were identified after 2026-08-30, so the existing baseline remains current.
- `2026-09-04-polyglot-data-platform-component-impact.md` translates ADR-002 into implementation impact, separating new provider/projection components from existing modules that require storage-ownership or interface changes, and defines the phased migration strategy.
- `2026-09-04-optimum-polyglot-data-platform-implementation-strategy.md` defines the contract-first, projection-first, infrastructure-later execution sequence, including provider refactors, transactional outbox, projection workers, rebuild/reconciliation, shadow reads, database introduction gates, scale tests, agent memory, and migration safety rules.
- `2026-09-05-databricks-native-connector-testing-checkpoint-and-handover.md` records the native Databricks connector implementation, production readiness, live test boundary, `dbw_clinixir.PUB` acceptance criteria, security rules, formal AI Governance Intelligence blockers, and the handover prompt for the next engineering agent.
- `2026-09-06-productionization-decisions-and-truth-boundaries.md` records the productionization decisions for the Module #3 blocker, external governance corpus, origin naming, semantic embeddings, Vercel/Render runtime split, temporary JDBC credentials, multi-schema scope, Supabase plan limitations, security posture reporting, and JDBC runtime incident handling.
- `2026-09-06-ai-assisted-lineage-suggestions.md` records the production implementation and verification of metadata-derived lineage suggestions, explicit review and promotion, production defects repaired, and the continuing separation from source-authoritative lineage.
- `2026-09-06-progress-checkpoint-and-agent-handover.md` is the current handover record. It summarizes production acceptance, current catalog/JDBC evidence, recent PRs, residual security warnings, the exact Module #3 blocker, open PR #42, the next execution sequence, and a copy-ready prompt for another engineering agent.

The capability matrix is intentionally broader than the current implementation scope. Future implementation should draw from it rather than recreate the exploration from scratch.

## Current continuation checkpoint

The immediate continuation task is PR #42, `Govern source operational readiness evidence`.

It separates configured source lifecycle state from discovery-backed operational evidence. The production database migration is already applied and its verifier is valid, while the PR application changes remain open pending merge and post-merge production verification.

The authoritative detailed checkpoint is:

- `2026-09-06-progress-checkpoint-and-agent-handover.md`

## Preservation rule

New discussions should be added as dated Markdown files. Older ideas must not be deleted when direction changes. Mark them as superseded, rejected, deferred, or replaced and append the newer decision with its context.

New architecture or implementation decisions with strategic significance should also be cross referenced from the Architecture repository.
