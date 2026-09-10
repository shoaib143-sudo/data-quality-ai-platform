# DataNexus Analyst Personas and Interactive Landing Experience

Date: 2026-09-10
Status: Finalised for implementation

## Context

The role-aware business landing experience has been refined through design review. The landing page remains a decision-support and governed-data consumption layer, not a generic operational dashboard.

Two additional specialist personas are now required: Metadata Analyst and Data Quality Analyst. This expands the landing-page baseline to thirteen personas.

## Design direction

The approved visual direction is dark mode with restrained Neumorphism, minimal information duplication, comfortable spacing and progressive disclosure.

Business-facing landing pages should surface the answer before technical mechanics. Technical detail remains available through drill-down.

## Interaction contract

A visible control or object must have a purpose.

- Buttons execute a task or navigate to a meaningful destination.
- KPI and metric cards are full interaction targets when a relevant drill-down exists.
- Finding, issue, domain, dataset, approval and activity rows open the corresponding evidence or workspace.
- Search must be functional rather than decorative.
- Filters must submit a real scope change.
- Interactive icons belong to a semantic link or button rather than acting as decorative dead targets.
- Controls with no meaningful task should be rendered as non-interactive information.
- Keyboard focus and clear hover/pressed behavior are part of the interaction contract.
- Drill-down should preserve scope where the destination supports it.

## Shared landing-page structure

Each persona may emphasize different sections, but the common cognitive sequence remains:

1. Current status
2. What changed
3. Risk or impact
4. Ownership and accountability
5. Decision or next action
6. Trend
7. Evidence drill-down

The experience should remain understandable without requiring users to know profile-run IDs, engine internals, metric implementation details or database structures.

## Data Confidence Trend

Data Confidence Trend requires a Business Domain selector and Time Range selector for role views where enterprise and domain comparison is useful.

Metadata Analyst and Data Quality Analyst additionally require a Dataset selector.

Data Quality Analyst additionally requires a Quality Dimension selector so the analyst can compare overall score, completeness, validity, accuracy and uniqueness at dataset level.

Related widgets should respect the same selected context where practical rather than behave as unrelated charts.

## Recently Viewed

Recently Viewed is a collapsible sidebar section placed above the DataNexus AI Agent. It should contain objects actually opened from the role experience, not hard-coded examples.

## DataNexus AI Agent

The AI Agent should be visually prominent. It exposes four to five conversation starters tailored to the current persona's responsibilities.

Examples for Senior Leadership include:

- What needs my attention today?
- Where is our biggest data risk?
- What changed since my last review?
- Which business decisions are affected?
- Are we improving overall?

The prompt is carried into the evidence experience so the user's intent is not discarded. AI suggestions remain advisory unless governed approval or execution authority says otherwise.

## Metadata Analyst

Primary question:

> How complete, connected and understandable is our metadata, and where are the gaps?

The experience emphasizes:

- domain assignment;
- ownership coverage;
- glossary mappings;
- classification coverage;
- critical-data mappings;
- dataset selection;
- metadata and lineage evidence;
- schema and metadata gaps;
- evidence-backed improvement actions.

## Data Quality Analyst

Primary question:

> Where is data quality deteriorating, why, and what should improve first?

The experience emphasizes:

- overall quality score;
- dataset-level quality trends;
- quality-dimension filtering;
- completeness, validity, accuracy and uniqueness;
- material findings;
- failed quality controls;
- profiling coverage;
- issue and root-cause drill-down;
- evidence-backed improvement recommendations.

## Scope boundary

This decision adds Metadata Analyst and Data Quality Analyst only.

Data Analyst and Data Engineer remain useful product concepts but are not added to the governance persona baseline in this increment. Adding them later requires explicit role semantics, authorization and landing-page intent rather than only a visual card.

## Security boundary

Organization administration remains independent of persona assignment. Only organization OWNER or ADMIN privilege can authorize `/admin`. Governance persona assignment controls role experience and operational workspaces only.

## Next implementation sequence

1. Complete all thirteen role landing pages using shared interaction and visual components.
2. Validate all role navigation and drill-down targets.
3. Apply the same dark minimal interaction system to every remaining application tab and sub-tab.
4. Validate route authorization, responsive states, empty/error/loading states and production deployment.
