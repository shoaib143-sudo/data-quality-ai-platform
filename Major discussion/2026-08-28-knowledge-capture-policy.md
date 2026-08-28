# DataNexus AI Knowledge Capture Policy

**Date:** 2026-08-28
**Status:** Active project operating rule

## Baseline principle

Capture as much useful information as possible during active DataNexus AI discussions. The first pass should favour preservation over compression.

A fruitful idea, example, alternative, concern, capability, architecture thought, business scenario, implementation insight, or strategic question should be recorded even when it is not yet confirmed for the roadmap.

The repository is intended to prevent loss of project knowledge across conversations, implementation sessions, and AI agents.

## Reconciliation principle

Reconciliation is a second stage. During reconciliation, information can be classified as:

- Current
- High priority
- Deferred
- Superseded
- Rejected
- Historical context
- Duplicate / consolidated
- Low value

Unwanted or genuinely low value material may be de emphasised or consolidated during reconciliation, but useful historical decisions and fruitful ideas should remain traceable.

## What should be captured

At minimum, capture:

1. Product vision and positioning
2. Roadmap ideas and phase discussions
3. AI capabilities and use cases
4. Concrete business examples
5. Business benefits
6. Problems the product is intended to solve
7. AI explanation and root cause capabilities
8. Prediction and risk capabilities
9. Recommendation and remediation capabilities
10. Governed AI agent concepts
11. Human guard rail decisions
12. Autonomy progression decisions
13. Personas and user experience considerations
14. Criticality definitions
15. Data source strategy
16. Unstructured data and document intelligence ideas
17. Governance, policy, regulatory and compliance concepts
18. Architecture discussions and alternatives
19. Infrastructure requirements and technology options
20. Data model and database decisions
21. Security, tenancy and authorization decisions
22. Operational monitoring and lifecycle requirements
23. Implementation discoveries
24. Bugs that reveal architectural or product requirements
25. Important rejected or deferred approaches
26. Questions that materially affect future design
27. Examples used to explain the product to stakeholders
28. Executive value propositions
29. Metrics and success criteria
30. Future autonomy opportunities

## Preserve examples

Examples are not optional decoration. They should be retained because they explain the intended capability and make future implementation decisions easier.

For example, a discussion about a job stuck at 100% should preserve the operational scenario, the desired user action, the diagnostic requirements, lifecycle implications, audit expectations, and potential AI investigation capability.

## Never silently delete direction changes

When a direction changes, append the new direction and explicitly identify the old direction as superseded, deferred, rejected, or historical.

Do not rewrite history to make the project appear as though the newer decision was always the original decision.

## Architecture preservation

Architecture follows the same principle. Significant architecture states and diagrams should be versioned. A newer diagram replaces the current recommendation but does not erase the historical architecture or the context for changing it.

## Reconciliation checklist

Before substantive implementation work:

1. Read the Major discussion index.
2. Review recent discussion records.
3. Review the latest AI capability matrix.
4. Read the current Architecture documentation.
5. Review recent architecture decisions.
6. Check current Git implementation state.
7. Identify documented capabilities not yet implemented.
8. Identify implementation changes not yet documented.
9. Identify contradictions or obsolete assumptions.
10. Preserve useful information before consolidating duplicates.

## Daily reconciliation

The daily documentation automation should use this policy as its baseline. Its purpose is not to aggressively summarise away project knowledge. Its first responsibility is preservation. Consolidation and prioritisation come after capture.

## Long term purpose

This knowledge base should allow a future human or AI contributor to understand not only what DataNexus AI currently is, but also why it became that way, which alternatives were considered, which capabilities remain possible, and what strategic thinking led to the roadmap.
