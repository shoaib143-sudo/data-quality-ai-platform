# Learning evaluation activation checklist

Infrastructure from PR #1078 is deployed. PR #1091 now binds prospective evaluation evidence into the existing governed release approval and controlled-release paths.

Before a live candidate:
1. Select the authorized project and immutable dataset-version allowlist.
2. Bind the exact candidate, baseline, rollback version, agent, skill and supported execution mode.
3. Assign an evaluator distinct from the proposer and bind rubric, calibration, manifest and locked analysis plan.
4. Register the evaluation policy through the service-role-only persistence path.
5. Verify experiment-specific runtime budget enforcement before paid execution. PR #1097 implements cancellation propagation and prevents cancellation-driven fallback. Immutable policy binding and atomic durable cost/token reservations are still required. Project admission and post-run checks do not satisfy this gate.
6. Collect real baseline and candidate evidence without relabeling historical or synthetic rows.
7. Independently compute the predeclared quality result and uncertainty.
8. Persist the result. Safety or authority violations reject; missing accounting stops; ties and insufficient evidence remain inconclusive.
9. Request release review only if the persisted result is REVIEW_REQUIRED + IMPROVED.
10. The existing dual-axis human approval, shadow canary, verification, activation and rollback controls remain authoritative.

The evaluation policy/result identity, manifest, mode and evaluator are included in the approval fingerprint and are revalidated through controlled release. No candidate experiment or production promotion is activated by this document.
