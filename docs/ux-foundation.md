# DataNexus UX Foundation

This document tracks the shared DataNexus product experience foundation.

## Goals

- provide one recognizable navigation surface across executive and persona experiences;
- make global search a real action rather than decorative chrome;
- make governance work discoverable through a consistent work-queue entry point;
- expose clear keyboard focus and semantic navigation;
- replace raw dashboard failure with a recoverable, user-facing state.

## Current increment

The shared `GlobalUtilityBar` is used by:

- the executive dashboard;
- role/persona landing pages.

It provides direct access to:

- Dashboard
- Catalog
- Quality
- Agents
- Global Search
- Governance Inbox
- Guided Governance Journey

The dashboard and priority governance workspaces now use shared loading, recoverable error, and actionable empty-state patterns. The Governance Inbox aggregates persisted approvals, issues, alerts, and execution attention. The guided journey derives project progress and the next recommended action from persisted source, discovery, profiling, remediation, and quality-control evidence. Shared-shell surfaces expose a keyboard-visible skip link and a focusable main-content landmark, with visible focus and reduced-motion handling enforced by CI contracts.

The guided journey emits a deliberately small, privacy-minimized product telemetry vocabulary for journey views and primary next-action selections. Events are authenticated, project-authorized, persisted to the existing service-only `orchestration.analytics_events` fallback store, and cannot mutate governance state. Interaction telemetry remains distinct from governed outcome evidence.

Denied workspace navigation now resolves to an explicit authenticated UX state instead of silently returning users to their role home. The denied state confirms that no data or permissions were changed, offers safe recovery destinations, and intentionally does not disclose internal capability names, policy rules, or authorization detail. Governance reporting now includes an experience-insights view that combines privacy-minimized interaction telemetry with authoritative source, profiling, remediation, and quality-control evidence while keeping analytics explicitly non-authoritative. Dataset and field lineage launchers now stack safely on narrow screens, bounded lineage drawers split search and graph panes vertically on small viewports, and the field explorer no longer forces a minimum-width search control or horizontal transformation direction when mappings are stacked.

## Next increments

The foundation is intentionally incremental. Remaining UX work includes:

- project and organization switching once multi-context switching is supported by the runtime;
- deeper task-based journeys beyond the initial connect → discover → profile → remediate → verify path;
- broader adoption of the shared actionable empty-state pattern across remaining legacy workspaces;
- full browser-assisted and manual accessibility review against WCAG 2.2 AA, including contrast, screen-reader semantics, zoom, tables, graphs, and touch targets;
- responsive treatment for remaining dense governance tables;

The shell must not imply capabilities that the backend does not yet authorize.
