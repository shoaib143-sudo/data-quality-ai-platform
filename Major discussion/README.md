# Major Discussion

This folder is the durable repository for useful product discussions, decisions, ideas, capability exploration, and implementation direction for DataNexus AI.

## Important boundary

This repository records discussion summaries, decisions, rationale, examples, open questions, and resulting actions. It does not attempt to store private model chain of thought or hidden reasoning. The goal is to preserve the useful project knowledge needed by future contributors and AI agents.

## Product identity

**DataNexus AI**

**Positioning:** From Data Intelligence to Autonomous Data Governance.

## Current strategic direction

DataNexus AI starts as an AI powered Data Intelligence platform. As the platform builds trusted knowledge about the data estate and confidence in AI decisions, it progressively evolves toward an Autonomous Data Governance platform.

## Core principles

1. Support all five major personas: Data Engineers, Data Stewards/Governance, Data Architects, Enterprise Leadership, and cross persona users.
2. Build for multi tenant operation.
3. Support all data source categories over time. Initial focus is CSV, database tables, then unstructured data and logs.
4. Treat unstructured governance material such as policies, standards, procedures, and regulatory documents as first class inputs.
5. Prioritise critical datasets, critical data elements, regulatory data, PII/sensitive data, financial data, customer data, and operational data.
6. Start with human guard rails and progressively increase AI autonomy as confidence, evidence, policy controls, and verification mature.
7. Design major operations so they can eventually be invoked by governed AI agents, not only through the UI.
8. Preserve evidence, decisions, actions, outcomes, audit history, and verification for AI operated workflows.

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

The capability matrix is intentionally broader than the current implementation scope. Future implementation should draw from it rather than recreate the exploration from scratch.

## Preservation rule

New discussions should be added as dated Markdown files. Older ideas must not be deleted when direction changes. Mark them as superseded, rejected, deferred, or replaced and append the newer decision with its context.

New architecture or implementation decisions with strategic significance should also be cross referenced from the Architecture repository.
