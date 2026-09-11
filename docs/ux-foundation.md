# DataNexus UX Foundation

This is the first implementation increment of the shared DataNexus product shell.

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
- Governance Work Queue

The dashboard now has an error boundary that offers retry and safe navigation without exposing raw provider errors.

## Next increments

The foundation is intentionally incremental. Remaining UX work includes:

- project and organization switching once multi-context switching is supported by the runtime;
- a true unified governance inbox spanning approvals, failures, alerts and deadlines;
- consistent async job status components;
- shared loading, empty, partial-data and policy-denied states;
- task-based journeys spanning source onboarding, discovery, profiling, remediation and certification;
- accessibility review against WCAG 2.2 AA;
- responsive treatment for dense governance tables and lineage;
- product telemetry for time-to-value and journey completion.

The shell must not imply capabilities that the backend does not yet authorize.
