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

The dashboard and priority governance workspaces now use shared loading and recoverable error states. The Governance Inbox aggregates persisted approvals, issues, alerts, and execution attention. The guided journey derives project progress and the next recommended action from persisted source, discovery, profiling, remediation, and quality-control evidence. Shared-shell surfaces expose a keyboard-visible skip link and a focusable main-content landmark, with visible focus and reduced-motion handling enforced by CI contracts.

The guided journey now also emits a deliberately small, privacy-minimized product telemetry vocabulary for journey views and primary next-action selections. Events are authenticated, project-authorized, persisted to the existing service-only `orchestration.analytics_events` fallback store, and cannot mutate governance state. Interaction telemetry remains distinct from governed outcome evidence.

## Next increments

The foundation is intentionally incremental. Remaining UX work includes:

- project and organization switching once multi-context switching is supported by the runtime;
- policy-denied states that clearly explain unavailable actions without leaking authorization detail;
- deeper task-based journeys beyond the initial connect → discover → profile → remediate → verify path;
- full browser-assisted and manual accessibility review against WCAG 2.2 AA, including contrast, screen-reader semantics, zoom, tables, graphs, and touch targets;
- responsive treatment for dense governance tables and lineage;
- product reporting that combines interaction telemetry with authoritative outcome evidence without treating analytics as governance truth.

The shell must not imply capabilities that the backend does not yet authorize.
