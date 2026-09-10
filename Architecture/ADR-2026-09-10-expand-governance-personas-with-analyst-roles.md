# ADR: Expand Governance Personas with Analyst Roles

Date: 2026-09-10
Status: Accepted

## Decision

DataNexus expands the role-based landing-page baseline from eleven to thirteen governance personas by adding:

1. Metadata Analyst
2. Data Quality Analyst

The existing eleven personas remain unchanged in purpose and authorization boundaries.

The resulting role-aware landing-page model is:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Product Owner
5. Data Steward
6. Data Governance Specialist
7. Compliance & Risk Officer
8. Privacy & Security Officer
9. Data Governance Admin
10. Data Custodian / Technical Steward
11. Source System / Application Owner
12. Metadata Analyst
13. Data Quality Analyst

Data Analyst and Data Engineer are not added to the governance persona baseline by this decision. They may be introduced later if a separate product and authorization decision requires them.

## Rationale

The existing role model covers governance decision-makers, consumers, operators and technical stewards, but two recurring specialist activities deserve dedicated role-aware experiences:

- metadata analysis across catalog coverage, business terminology, ownership, classification, lineage and schema change evidence;
- data-quality analysis across datasets, quality dimensions, findings, trends, root causes and evidence-backed remediation opportunities.

These specialist views should remain connected to the same governed evidence used by other personas rather than create independent calculations in the frontend.

## Landing-page interaction contract

Role landing pages use the following interaction rules:

- every visually actionable card, metric, object, row, icon or call-to-action must navigate, drill down, filter, open a governed action, or otherwise perform a clear task;
- controls that have no meaningful action must not be styled as interactive;
- drill-down should preserve business-domain, dataset, quality-dimension and time-range context where relevant;
- Business Domain and Time Range are first-class trend filters;
- Metadata Analyst and Data Quality Analyst receive Dataset-level filtering;
- Data Quality Analyst additionally receives Quality Dimension filtering;
- Recently Viewed is collapsible and records landing-page drill-down navigation locally for convenience;
- DataNexus AI is visually prominent and exposes persona-specific conversation starters;
- AI prompts remain governed context and must not be presented as governance authority;
- empty states must remain truthful and should provide an appropriate next action where one exists.

## Metadata Analyst intent

Primary question:

> How complete, connected and understandable is our metadata, and where are the gaps?

Primary evidence includes:

- business-domain assignment coverage;
- accountable ownership coverage;
- approved glossary mappings;
- approved classification evidence;
- critical data mappings;
- lineage and schema-change evidence;
- dataset-level metadata summaries and drill-down.

## Data Quality Analyst intent

Primary question:

> Where is data quality deteriorating, why, and what should improve first?

Primary evidence includes:

- overall and dataset-level quality score;
- completeness, validity, accuracy and uniqueness dimensions;
- material findings;
- failed quality controls;
- profiling coverage;
- domain and dataset trend filtering;
- root-cause and remediation evidence through profiling and issue drill-down.

## Authority and security boundaries

This expansion does not change organization administration authority.

- organization `OWNER` and `ADMIN` remain the only sources of `/admin` authority;
- governance personas do not grant organization administration;
- landing-page availability remains organization-scoped;
- workspace authorization remains independent of navigation visibility;
- server-side route guards remain authoritative;
- service-role access is not exposed to the client;
- governance meaning, thresholds and evidence authority remain backend concerns.

## Data model impact

`governance.landing_page_settings.persona_slug` now permits the two additional persona slugs:

- `metadata-analyst`
- `data-quality-analyst`

`governance.access_roles` now includes:

- `METADATA_ANALYST`
- `DATA_QUALITY_ANALYST`

The matching database migration is `supabase/migrations/20260910072400_expand_governance_personas_with_analysts.sql`.

## Related records

- `Architecture/ADR-2026-09-09-role-based-governance-landing-pages.md`
- `Architecture/ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`
- `Major discussion/2026-09-09-role-based-business-ui-and-governance-personas.md`
- `Major discussion/2026-09-10-analyst-personas-and-interactive-landing-experience.md`
