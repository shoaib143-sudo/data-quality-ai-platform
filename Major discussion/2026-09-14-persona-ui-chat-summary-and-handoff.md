# Chat Summary: Persona-Driven DataNexus UX, Acceptance, and Release Decisions

Date: 2026-09-14

## Scope of this discussion

This discussion focused on turning the 13 governed DataNexus personas into realistic application experiences, verifying their real-life responsibilities, fixing authorization/UI mismatches discovered during persona testing, and redesigning the DataNexus UI around an approved dark navy reference.

The user explicitly asked for autonomous execution and asked that implementation should continue without waiting for repeated confirmation.

The user later clarified that two separate workstreams are being handled by other agents:

1. Living Tree Job Monitor.
2. Agent Policy v2, PR #422.

Those two streams should not be treated as pending work owned by this persona/UI thread.

## Canonical personas confirmed

The discussion reaffirmed the 13 application personas and their product focus:

| # | Persona | Primary focus |
|---:|---|---|
| 1 | Senior Leadership | Enterprise trust, material risk, business impact, governance outcomes |
| 2 | Business User | Finding and safely consuming trusted governed data |
| 3 | Data Owner | Business accountability, critical data, risk decisions |
| 4 | Data Product Owner | Product trust, certification, reliability, consumer outcomes |
| 5 | Data Steward | Stewardship, investigation, curation, remediation |
| 6 | Data Governance Specialist | Governance effectiveness, maturity, adoption, control coverage |
| 7 | Compliance & Risk Officer | Regulatory exposure, control effectiveness, exceptions, evidence |
| 8 | Privacy & Security Officer | Sensitive data protection, classification, privacy/security exposure |
| 9 | Data Governance Admin | Platform operation, workflows, schedules, configuration |
| 10 | Data Custodian / Technical Steward | Technical controls, source reliability, execution, remediation |
| 11 | Source System / Application Owner | Upstream source reliability and downstream defect prevention |
| 12 | Metadata Analyst | Metadata completeness, meaning, ownership, classification, lineage |
| 13 | Data Quality Analyst | Quality dimensions, trends, findings, root cause, improvement |

The discussion repeatedly emphasized that landing-page content must differ materially by persona rather than using one generic dashboard with different labels.

## Key UX decisions

### Common theme

The supplied dark navy reference became the visual design direction for DataNexus.

The user requested:

- the same theme and placement standards for every persona landing page;
- the same overall theme throughout the DataNexus product;
- careful attention to spacing and visual detail;
- persona-specific content within the shared visual language.

This was implemented in batches and subsequently refined after screenshot review.

### AI Agent placement

The original layout showed DataNexus AI Agent information in more than one place. The user flagged this as duplicate information.

The agreed final model is:

- one small floating AI icon;
- positioned on the left side;
- opens a hovering chat panel over the current UI;
- does not permanently consume the right side of the screen;
- does not redirect users to another page just to start a conversation;
- supports meaningful persona-aware conversation;
- can expand without becoming the primary page layout.

The floating agent was implemented in PR #407.

### Interactivity

The user asked that meaningful buttons, keywords, information, metrics, and evidence be interactive.

The resulting guideline is to make governed summaries drill into their source, evidence, reference, or underlying workspace whenever a meaningful source exists.

This is not a requirement to make decorative text artificially clickable.

### Senior Leadership language

The user explicitly noted that some personas, especially Senior Leadership, have fewer direct operational actions.

For Senior Leadership, landing information should therefore be:

- non-technical;
- business-impact specific;
- focused on enterprise trust;
- focused on material risk and exposure;
- focused on governance outcomes and improvement;
- focused on decisions requiring executive attention.

Technical identifiers and execution-engine details should be suppressed from primary executive presentation.

## Data Domain decision

The user requested a DQ trend filter based on data domains/products and then clarified that a single nomenclature should be used: **Data Domain**.

GitHub review showed that the core domain filter already existed and was backed by `catalog.datasets.business_domain`.

The implementation was expanded beyond label cleanup.

Final product rules:

- visible nomenclature is `Data Domain`;
- selector includes `All Data Domains`;
- Data Domain selection must scope DQ trend evidence;
- relevant dataset-linked landing metrics and evidence should also inherit the scope;
- stale dataset selection must not override a newly selected domain;
- project-wide evidence must be clearly identified where it cannot truthfully be scoped to Data Domain.

The narrow terminology-only PR #400 was closed as superseded by the broader Batch 2 implementation.

PR #402 merged the complete landing scope work.

## Persona-specific information hierarchy

A GitHub review compared:

- persona definitions;
- persona presentation policy;
- persona acceptance tasks;
- presentation rendering;
- live landing data assembly.

The review found all 13 personas were represented, but the initial common renderer was still too uniform.

The final direction was to preserve one shared design language while using different information hierarchies.

Three broad presentation families were used:

1. executive/business;
2. governance/risk;
3. technical/analytical.

PR #405 implemented genuinely persona-specific hero, trend, attention, context, action, metric, and AI-prompt framing across all 13 personas.

## Persona acceptance and authorization findings

The persona acceptance work discovered several gaps that route-level verification alone had missed.

Important examples included:

- shared pages showing mutation controls to read-only personas;
- Glossary exposing create/lifecycle/mapping controls without `glossary.manage`;
- dataset detail exposing profiling execution/remediation controls based on workspace visibility rather than `profiling.execute`;
- profiling remediation verification being authorized with a read capability despite persisting governed outcome state;
- prior schedule, classification, stewardship, and certification capability mismatches.

These were treated as authorization/UX defects, not reasons to widen personas.

PR #398 consolidated important mutation-visibility and profiling/glossary hardening.

The governing rule remains:

**The API/server is authoritative. The UI should mirror authority but never replace it.**

## Real-life persona task contract

The discussion moved from route checks toward real-life persona responsibilities.

A canonical acceptance registry was added covering 67 explicit real-life tasks across the 13 personas.

The task model captures:

- route;
- read or mutate mode;
- required capability where applicable;
- expected governed evidence.

The live production role matrix was cross-checked against required mutation capabilities and matched all declared pairs at the time of verification.

This contract exists to prevent acceptance from degrading into "the page loads".

## Test-principal findings

The 13 persona test principals were structurally verified with:

- Supabase Auth identity;
- organization membership;
- exactly one active project role binding;
- expected persona role;
- persona landing enabled.

Literal password-based browser acceptance remained a separate dimension.

Automation later encountered a safety restriction when trying to submit raw passwords, so literal login evidence must not be fabricated or bypassed by weakening authentication.

The architecture documents already record these distinctions in more detail.

## Runtime issue discovered during persona acceptance

Production verification also surfaced intermittent worker-pool claim gateway timeouts.

This was deliberately separated from persona authorization.

Follow-up engineering work subsequently landed multiple orchestration changes, including PRs #403, #408, #410, #420, and #421.

That runtime work should remain a separate operational-resilience track rather than being misclassified as persona acceptance failure.

## UI implementation batches and current merged state

The persona/UI redesign was intentionally delivered in batches.

| Batch | PR | Result |
|---|---:|---|
| Capability/mutation hardening | #398 | Merged |
| Shared DataNexus visual system | #401 | Merged |
| Data Domain and landing scope integrity | #402 | Merged |
| 13 persona-specific landing compositions | #405 | Merged |
| Floating persona-aware AI Agent | #407 | Merged |
| Whole-product DataNexus theme | #409 | Merged |
| Screenshot-driven persona landing refinements | #417 | Merged |

At the time of this summary, repository `main` had advanced further through orchestration/runtime work, including PR #421.

Future persona/UI changes must use current `main`, not any of the historical batch heads.

## Best-practice release checks agreed in the discussion

Before considering future persona UX changes complete, verify:

1. Persona relevance: each primary card supports that persona's real-life question or responsibility.
2. Information hierarchy: executives see business outcomes, operators see work, technical users see diagnostics.
3. Data Domain consistency: use the canonical term and propagate applicable scope.
4. Evidence provenance: important numbers should drill to their underlying governed evidence.
5. Authorization: do not show actionable controls that the persona cannot execute.
6. Truthful empty state: distinguish zero, unavailable, inaccessible, not measured, and not applicable.
7. Freshness: show evidence timing where stale data could change interpretation.
8. AI truth boundary: generated interpretation must remain distinct from governed evidence.
9. Responsive behavior: prevent clipped cards and unintended horizontal scrolling.
10. Accessibility: keyboard focus, labels, contrast, semantic controls, and non-color status cues.
11. Back-navigation preservation: scope/filter state should survive reasonable drill-down workflows.
12. Cross-persona leakage: common components must not accidentally expose another persona's language or actions.
13. Performance: avoid excessive landing-page governance queries and uncontrolled evidence loading.
14. Failure behavior: partial service failure must not become a believable zero-value dashboard.

## Current ownership boundaries

The user explicitly stated that the following are being handled by other agents:

- Living Tree Job Monitor;
- Agent Policy v2, PR #422.

This persona/UI discussion should therefore focus on integration compatibility only and avoid independently taking ownership of those two streams unless requested.

## Recommended continuation focus

If further work continues from this summary, priority should be:

1. production acceptance of the merged persona/theme experience;
2. remaining persona-specific UX defects discovered from real signed-in use;
3. consistency of Data Domain scope and evidence provenance;
4. interaction quality and drill-down behavior;
5. accessibility and responsive refinements;
6. integration checks when Living Tree and Agent Policy v2 merge.

Do not reopen already-merged persona/UI batches merely to recreate work. Inspect current `main` first and make the smallest compatible change.
