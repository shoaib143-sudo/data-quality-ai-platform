# DataNexus Experience Insights

The Experience Insights workspace at `/reports/experience` summarizes the bounded product telemetry emitted by the guided governance journey.

It is deliberately separated from governed reports and certification evidence. Counts such as journey views, next-action selections, and projects observed at the COMPLETE interaction stage describe product interaction only.

The workspace:

- uses the existing `orchestration.analytics_events` fallback analytics store;
- reads only the `ux_governance_journey` aggregate and the two allow-listed UX event types;
- inherits the Reports workspace authorization policy;
- presents an accessible stage table rather than implying precision through decorative charts;
- links back to the evidence-driven journey and governed reports;
- never changes governance state.

A project appearing at the COMPLETE interaction stage does not prove certification, remediation success, or service readiness. Those claims must continue to come from authoritative domain evidence.
