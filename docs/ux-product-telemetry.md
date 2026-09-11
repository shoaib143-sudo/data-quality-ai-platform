# DataNexus UX Product Telemetry

This contract adds privacy-minimized product telemetry for the evidence-driven governance journey.

## Purpose

The telemetry answers product questions without becoming governance authority:

- which governed projects reach each guided-journey stage;
- where users most often need a next action;
- whether users progress from Connect through Verify Controls;
- elapsed time between the first observed journey interaction and later journey completion only when both a COMPLETE interaction and the governed evidence-completion boundary are observed.

## Events

The initial event vocabulary is intentionally small:

- `UX_JOURNEY_VIEWED`
- `UX_JOURNEY_NEXT_ACTION_SELECTED`

Each event records only:

- the authorized project identifier;
- the authenticated platform actor identifier;
- the current journey stage;
- the count of satisfied journey stages;
- a fixed total stage count;
- server-generated event time and event identifier.

The event body does not accept arbitrary analytics payloads, page contents, search text, dataset names, source credentials, prompts, document contents, or secret values.

## Authorization and persistence

`POST /api/ux/events` requires an authenticated user and verifies `catalog.read` capability for the supplied project before persistence.

Accepted events are written through the service-role client to `orchestration.analytics_events`, the existing service-only PostgreSQL fallback analytics store. Governance source-of-truth tables remain authoritative. UX telemetry never changes project, dataset, profiling, remediation, workflow, or control state.

## Delivery behavior

Journey-view events are de-duplicated best-effort per browser session for the same project, stage, and completed-stage count. Next-action selections are emitted when the user follows the primary guided recommendation.

Telemetry delivery is intentionally non-blocking. Network or persistence failure must not stop navigation or prevent governed work. Server responses expose generic failures rather than database/provider details.

## Measurement boundary

A telemetry event proves only that the application accepted a product-interaction event at a point in time. It does not prove that the recommended downstream task succeeded. Journey completion remains derived from persisted governance evidence in the journey workspace itself.

Time-to-value and funnel metrics must therefore distinguish:

1. interaction telemetry, such as opening a journey or selecting the next action; and
2. governed outcome evidence, such as an observed-ready source, completed profile, remediation evidence, or passing quality control.

## Privacy boundary

The initial contract intentionally avoids free-form user-entered content and sensitive business payloads. Any future event field must be allow-listed, documented, authorized, and reviewed before collection.


## Experience insights

The authorized reporting surface at `/reports/experience` combines the bounded interaction events with governed domain evidence. Completion timing is intentionally conservative: the report emits a duration only when the project satisfies the reporting evidence boundary and a `UX_JOURNEY_VIEWED` event with stage `COMPLETE` has been observed. A telemetry-only COMPLETE event is insufficient.
