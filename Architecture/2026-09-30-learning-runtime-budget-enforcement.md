# Learning runtime budget enforcement

## Verified boundary

The native OpenAI-compatible provider forwards execution-owned AbortSignal to fetch and rejects already-cancelled calls before transport. The resilience wrapper checks the same signal before attempts and after failures. An expired run deadline cannot trigger paid fallback. Existing fallback for transient provider failures remains available while the execution signal is live.

Behavior tests cover cancellation before transport, in-flight deadline propagation, cancellation suppressing fallback, and ordinary network fallback. No paid provider was called.

The governed observable router now carries a server execution-owned signal to provider requests. A request-level signal is combined with the execution signal and cannot replace it. Cancellation while admission is being resolved prevents the provider call and releases acquired leases. Completed usage received at the observable boundary is accounted before a cancellation racing the result is rejected. Missing usage after an aborted transport remains unresolved.

Validation also covers an already-cancelled execution, caller signal replacement attempts, cancellation after lease acquisition, and accounting of a late completed response. Next.js was patched from 16.3.3 to 16.3.6 for GHSA-vcvr-r3jv-pc5j while preserving dependency overrides. Local production dependency audit reports no known vulnerabilities; exact-head CI remains authoritative for integration and build validation.

## Remaining implementation

This change is a prerequisite, not experiment budget activation. Persisted learning policy limits are not yet bound to an experiment executor. Next, resolve immutable project/agent/mode policy identity server-side, establish a run-wide deadline, and bind every baseline/candidate invocation and retry to that identity. Add atomic durable reservations before provider calls for experiment model-call, token and USD ceilings; reconcile canonical usage and pricing, retain unresolved reservations when usage is unavailable, and reject unsupported accounting rather than assume zero cost. Enforce total-token limits using provider-specific input accounting and an output ceiling. Stop later calls when limits or evidence are missing. Tests must exercise concurrent admission and crash recovery.

Transport cancellation cannot guarantee that a remote provider stops generation or charges nothing. Missing usage after cancellation remains unknown. Project-level admission and post-run evaluation checks do not prove an experiment-level hard cost ceiling.

## Frontier capability challenge

Reference: OpenAI Agents SDK running-agents guide, https://openai.github.io/openai-agents-js/guides/running-agents/ (reviewed 2026-09-30), exposes execution cancellation through AbortSignal and bounded turns.

| Capability | Status | Disposition | Evidence or remaining gap |
| --- | --- | --- | --- |
| Native provider cancellation propagation | PARTIAL | BORROW_PATTERN | Behavior tests verify transport and fallback; executor policy deadline binding remains required. |
| Durable experiment cost/token/call reservation | GAP_REQUIRED | BUILD_NOW | No atomic experiment reservation evidence; do not activate paid experiments. |
| Remote cancellation charge guarantee | NOT_APPLICABLE | NOT_APPLICABLE | Transport abort is not a billing guarantee. |
| Existing governance authority | PARITY | KEEP | No authentication, project scope, approval, rollback, tool authority or ADR-007 classification changes. |

The provider interface remains replaceable. Native DataNexus policy and accounting stay authoritative; no framework dependency was introduced. Real baseline/candidate experiments remain pending configured policies and enforcement.
