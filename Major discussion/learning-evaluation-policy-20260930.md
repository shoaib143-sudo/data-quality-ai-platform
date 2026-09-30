# Prospective self-improvement evaluation

See the [canonical evaluation policy and live inventory](../docs/testing/learning-evaluation-policy-20260930.md) and the [implementation status](../docs/testing/learning-evaluation-policy-implementation-status-20260930.md).

Decision: benchmark eligibility and prospective improvement are separate gates.

A tied benchmark may remain eligible for human review under the historical benchmark contract, but it does not establish self-improvement. PR #1091 adds a stricter prospective gate. Release review now requires persisted evidence of a predeclared positive gain, independently verified evidence, sufficient sample coverage, positive uncertainty lower bound, confirmation window, complete accounting, no safety or authority violations, and compliance with locked cost, token and latency ceilings.

The gate does not auto-promote. It feeds the existing human approval and controlled shadow-canary path. Exact policy/result identity, manifest, execution mode and evaluator are bound into the approval fingerprint and revalidated during controlled release.

Historical run counts, synthetic fixtures and successful technical execution are not prospective improvement evidence.
