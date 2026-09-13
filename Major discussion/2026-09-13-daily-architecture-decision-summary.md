# September 13 Daily Architecture and Major Decision Summary

**Date:** 2026-09-13

## Major decisions

- Persona acceptance now requires meaningful workflow evidence, not only structural route checks.
- All 13 persona landings may tailor presentation while sharing the same governed evidence.
- Profile and Settings are governed through the shared account workspace.
- Stewardship management, certification request, and certification review remain separate capability boundaries.
- Agents workspace visibility is aligned to the canonical agent execution capability.
- Data Domain is the canonical business-facing term for domain evidence.
- A shared DataNexus visual system is now a product-wide contract with deterministic verification.
- Worker claim transport failures remain separate from durable job business failures.
- Stale queue maintenance runs once per scheduled worker invocation rather than inside every workload-pool claim.
- Claim degradation evidence is separated from the database path experiencing transport degradation.
- Gateway-timeout claim handling now permits one bounded idempotent replay with the same claim identity and arguments.
- Release claims continue to distinguish implementation, validation, merge, deployment, and production verification.

## Authority boundaries

Deterministic server policy, capability checks, database controls, workflow contracts, and evidence verifiers remain authoritative. UI presentation must accurately reflect these controls but does not replace them.

Persona-specific UX may change interpretation, task emphasis, and business framing. It may not create new governance facts.

AI may generate derived intelligence and recommendations, but final governance decisions remain with governed human and deterministic policy layers.

Transport degradation does not grant authority to mutate durable business state.

## Superseded decisions

- Capability-only remediation routing was superseded by capability plus workspace-access composition.
- Generic persona landing presentation was superseded by persona-specific presentation over shared governed evidence.
- Profile and Settings outside workspace policy were superseded by the governed account workspace.
- Agents workspace access inferred from broad persona shape was superseded by exact capability alignment.
- Queue maintenance embedded in normal claims was superseded by once-per-invocation maintenance.
- The earlier no-replay position for gateway-timeout claim transport was superseded by one bounded idempotent replay for safely repeatable claim operations.

## Unresolved items

- Complete real-workflow persona acceptance evidence is still pending across the full persona set.
- Fresh production verification is still needed for the durable-worker timeout mitigation.
- Living Tree job monitoring remains draft and is not production-accepted.
- The legacy visual compatibility bridge still needs a retirement plan.

## Current implementation direction

1. Start from authoritative policy, schema, capability, and evidence contracts.
2. Treat design and presentation truth as part of governance correctness.
3. Compose independent authorization gates rather than infer one from another.
4. Keep persona-specific experiences as projections over shared evidence.
5. Keep transport failures separate from durable business-state failures.
6. Use bounded idempotent replay only for narrowly classified transport uncertainty.
7. Preserve exact lifecycle truth from implementation through production verification.
8. Fail closed where authority, identity, state, or evidence is unknown.

Repository baseline reviewed: `b0d38ffc7eb2222b48e530d781c17209f39cefba`.
