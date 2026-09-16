# Agent Trajectory and Long-Horizon Certification

## Principle

A correct final answer is insufficient. Consequential agent trajectories must themselves be valid.

## Trajectory assertions

Validate, as applicable: context retrieval, policy selection, plan, specialist selection, tool choice, resource scope, parameters, approval boundary, fingerprint/execution binding, side effects, evidence, final state, and audit chain.

No unauthorized intermediate side effect is acceptable even when the final answer is correct.

## Long-horizon tests

Exercise multi-step workflows at increasing horizons, including 20, 50, and 100+ tool/state transitions where supported. Cover accumulated context, retries, partial progress, stale state, repeated tools, loops, budget exhaustion, cancellation, recovery, and resumability.

## Circuit breakers

Automatically verify kill switch, cancellation, budget limits, maximum-step/tool limits, repeated-action detection, and prevention of further side effects after termination.
