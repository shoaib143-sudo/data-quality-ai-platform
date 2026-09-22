# DataNexus UX Modernization — All Pages Coverage

This manifest is the authoritative UX coverage boundary for the modernization wave. It intentionally includes **every Next.js page route currently present under `app/**/page.tsx`** on the integration branch.

## Design system

- Primary typeface: **Inter**.
- Direction: modern, minimal, mild neomorphism; calm slate/navy canvas; restrained cyan/violet accenting.
- Density: 8px rhythm, compact grouped surfaces, reduced dead space, responsive auto-fit grids.
- Interaction: progressive disclosure, contextual preview, sticky context where useful, one primary action per decision zone.
- Accessibility: visible focus, semantic status color, WCAG-oriented contrast, keyboard-safe navigation; depth must never be the only affordance.
- Product model: object-centered 360 views with specialist workspaces as context-preserving drill-downs.

## Page families

### Entry, auth & access (7)

Calm, low-cognitive-load entry surfaces; single dominant action; mild recessed form field treatment; strong validation/error affordance.

| Route file | Coverage |
|---|---|
| `app/access-denied/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/forgot-password/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/home/unavailable/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/login/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/reset-password/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/signup/page.tsx` | Global modernized foundation + family-specific revalidation |

### Administration & AI control plane (15)

High-density expert workspace; compact tables and rails; command-center hierarchy; operational posture instead of decorative KPI sprawl.

| Route file | Coverage |
|---|---|
| `app/admin/ai-command-center/audit/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/explorer/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/learning-governance/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/pricing-authority/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/resource-controls/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/retrieval-evaluation/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/ai-command-center/traces/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/cleanup/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/identity/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/infrastructure/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/landing-pages/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/learning-cases/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/admin/project-roles/page.tsx` | Global modernized foundation + family-specific revalidation |

### AI, agents & learning (6)

Ask → evidence → recommend → approve → execute → observe → learn; agent/run 360; provenance and guardrails visible before raw telemetry.

| Route file | Coverage |
|---|---|
| `app/agents/[agentKey]/[version]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/agents/autonomous-governance/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/agents/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/agents/runs/[runId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/ai-capabilities/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/ai-insights/page.tsx` | Global modernized foundation + family-specific revalidation |

### Governance workflow & evidence (8)

Decision journey, approvals, evidence and verification in one flow; clear pending/blocked/completed states and accountable actor.

| Route file | Coverage |
|---|---|
| `app/approvals/external/[token]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/approvals/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/audit/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/journeys/[projectId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/journeys/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/reports/experience/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/reports/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/workflows/page.tsx` | Global modernized foundation + family-specific revalidation |

### Sources, datasets & catalog (7)

Search-first discovery; compact list/grid toggle patterns; quick preview; object-centered Data 360; contextual next actions.

| Route file | Coverage |
|---|---|
| `app/catalog/dataset/[datasetId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/catalog/discovery/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/catalog/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/catalog/physical-assets/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/datasets/dataset/[datasetId]/edit/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/datasets/edit/[sourceId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/datasets/page.tsx` | Global modernized foundation + family-specific revalidation |

### Metadata & governance context (8)

Entity context first; responsibilities and policy evidence grouped; administration progressively disclosed rather than box-heavy.

| Route file | Coverage |
|---|---|
| `app/classification-privacy/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/classification/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/contracts/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/documents/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/glossary/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/resource-access/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/retention/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/stewardship/page.tsx` | Global modernized foundation + family-specific revalidation |

### Home, navigation & personal (7)

Role-aware command surface; dense-but-readable attention queue; fewer oversized cards; quick navigation and contextual AI.

| Route file | Coverage |
|---|---|
| `app/dashboard/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/home/[persona]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/home/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/inbox/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/profile/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/search/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/settings/page.tsx` | Global modernized foundation + family-specific revalidation |

### Profiling & data quality (7)

Trend and exceptions first; score dimensions second; controls/findings drill-down; responsive metrics with no crowded card grids.

| Route file | Coverage |
|---|---|
| `app/data-quality/autonomous/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/data-quality/exceptions/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/data-quality/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/data-quality/rules/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/profiling/explorer/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/profiling/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/scorecards/page.tsx` | Global modernized foundation + family-specific revalidation |

### Issues, observability & operations (9)

Timeline/change-first investigation; impact radius; owner/action/verification spine; operational telemetry progressively disclosed.

| Route file | Coverage |
|---|---|
| `app/issues/[issueId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/issues/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/monitoring/domain/[projectId]/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/monitoring/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/observability/incidents/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/observability/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/observability/settings/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/recovery/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/schedules/page.tsx` | Global modernized foundation + family-specific revalidation |

### Lineage & impact (4)

Graph-first progressive expansion; context drawer; upstream/downstream impact summaries; never infer missing lineage.

| Route file | Coverage |
|---|---|
| `app/lineage/impact/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/lineage/ingest/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/lineage/page.tsx` | Global modernized foundation + family-specific revalidation |
| `app/lineage/suggestions/page.tsx` | Global modernized foundation + family-specific revalidation |

### Platform (1)

Architecture/health overview with restrained visual hierarchy, environment context and action-oriented status.

| Route file | Coverage |
|---|---|
| `app/platform/page.tsx` | Global modernized foundation + family-specific revalidation |

## Revalidation checklist for every route

1. Information hierarchy and primary task are obvious within the first viewport.
2. Inter typography and shared semantic tokens are used consistently.
3. Empty space is intentional; avoid isolated cards when grouping or split layouts are clearer.
4. No overlapping, clipped, or forced-density metric cards at desktop/tablet/mobile breakpoints.
5. Mild neomorphic depth preserves contrast and clickable affordance; avoid heavy glow.
6. Primary/secondary/destructive actions are visually distinct and policy-correct.
7. Empty, loading, error, denied, disabled and no-evidence states are explicit.
8. Context is preserved when drilling between 360 views and specialist workspaces.
9. AI advice is labeled advisory and exposes evidence/provenance where available.
10. Keyboard focus, semantics, contrast, narrow-screen overflow and touch targets are validated.

Total routes covered: **79**.
