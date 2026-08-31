# Major Discussion

This folder is the durable repository for useful product discussions, decisions, rationale, examples, capability exploration, open questions, and implementation direction for DataNexus AI.

## Important boundary

This repository records project knowledge needed by future human contributors and AI agents. It does not store private model chain of thought or hidden reasoning.

## Product identity

**DataNexus AI**

**Positioning:** From Data Intelligence to Autonomous Data Governance.

## Current strategic direction

DataNexus AI starts as an AI powered Data Intelligence platform. As the platform builds trusted knowledge about the data estate and confidence in AI decisions, it progressively evolves toward an Autonomous Data Governance platform.

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

## Major discussion index

- `2026-08-28-product-direction.md` captures the current product vision, AI capability direction, personas, criticality model, data source strategy, autonomy guard rails, and product naming decision.
- `2026-08-28-ai-capability-matrix.md` preserves the broad AI capability exploration, including 75 strategic use cases, concrete examples, business benefits, problem statements, AI contribution, prioritisation, governed autonomy, investigation, explanation, prediction, recommendation, remediation, verification, and agent capabilities.
- `2026-08-28-knowledge-capture-policy.md` defines the capture first, reconcile second rule and the requirement to preserve useful history, examples, alternatives, superseded ideas, and rejected approaches.
- `2026-08-28-session-summary-and-next-plan.md` records the prior session summary and implementation starting plan.
- `2026-08-29-reconciliation.md` records the confirmed priorities: CSV and database tables first, PostgreSQL / Supabase followed by Databricks, the Data Profiling Investigation Agent, an issue centric AI Operations Center, and business benefit measurement.
- `2026-08-30-reconciliation.md` records the next reconciliation checkpoint and confirms that no new product or architecture decisions were identified after the 2026-08-29 record.
- `2026-08-31-reconciliation.md` records the latest checkpoint. No new durable product or architecture decisions were identified after 2026-08-30, so the existing baseline remains current.

The capability matrix is intentionally broader than the current implementation scope. Future implementation should draw from it rather than recreate the exploration from scratch.

## Preservation rule

New discussions should be added as dated Markdown files. Older ideas must not be deleted when direction changes. Mark them as superseded, rejected, deferred, or replaced and append the newer decision with its context.

New architecture or implementation decisions with strategic significance should also be cross referenced from the Architecture repository.
