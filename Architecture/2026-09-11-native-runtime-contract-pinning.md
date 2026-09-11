# Native Runtime Contract Pinning and Tool Guardrails

Date: 2026-09-11
Status: implementation slice
Architecture basis: ADR-007 / ADR-008 native-first agent runtime

## Purpose

This slice closes two gaps left explicit by the first native checkpoint/interrupt/replay foundation:

1. long-lived agent execution must not silently resume under a different runtime, agent definition, prompt, or tool contract;
2. a registered tool schema is not sufficient unless input/output validation and execution authorization are enforced at the tool boundary.

The implementation remains native to DataNexus. No external agent framework becomes execution authority.

## Runtime manifest

Each participating `agent_run` receives one immutable private runtime manifest. It pins:

- exact agent definition ID/key/version;
- behavior-defining agent definition snapshot, including system prompt and configuration;
- exact application runtime version / deployment commit identity;
- exact enabled tool definitions, versions, input schemas, output schemas and execution configuration;
- SHA-256 hashes for the definition, tool set and complete manifest.

The full manifest is intentionally service-role only. It is not browser-readable because it contains system prompts and internal execution configuration.

A run cannot switch runtime versions after its manifest is created. A deployment change during a long-lived pause therefore fails closed instead of silently resuming different code. A future compatibility mechanism may allow explicitly certified runtime upgrades; this slice does not guess compatibility.

## Administrative revocation versus reproducibility

Pinned semantics remain stable for the run, but current registry `enabled` flags are checked at tool admission. This preserves an emergency administrative kill switch: a disabled agent or tool cannot continue executing merely because an older run pinned it.

## Tool boundary

The existing `agent.tool_definitions` registry remains authoritative for tool registration. It already contains versioned input/output JSON schemas and execution configuration, so this slice does not duplicate that registry.

At runtime:

1. the run manifest is created or verified;
2. the requested tool must exist in the pinned manifest;
3. the pinned executor must match the executor attempting to run it;
4. only declared input properties are passed to the executor;
5. snake_case/camelCase aliases are resolved deterministically for existing contracts;
6. input is validated against the pinned contract before execution;
7. administrative enabled flags are checked;
8. side-effect/idempotency/approval constraints are enforced;
9. invocation evidence is admitted before tool execution;
10. output is validated against the pinned contract;
11. success/failure is finalized in an immutable hash-only invocation ledger.

Raw input and output payloads are deliberately not copied into the invocation ledger.

## JSON contract support

DataNexus currently uses a bounded JSON-Schema subset in registered tool contracts. The native validator supports the keywords present in the production registry plus conservative common bounds:

- `type` including nullable type arrays;
- `properties` / `required` / `additionalProperties`;
- `enum` / `const`;
- `format: uuid` and `format: date-time`;
- numeric `minimum` / `maximum`;
- string `minLength` / `maxLength` / `pattern`;
- array `items` / `minItems` / `maxItems`;
- `default` as non-authoritative annotation.

An unsupported schema keyword or format fails closed. DataNexus does not silently approximate an unfamiliar contract.

## Side effects and approval

Read-only and explicitly idempotent tools can execute under their pinned governed contract and existing DataNexus policy boundaries.

A non-idempotent side-effecting tool is rejected unless its pinned contract explicitly declares human approval and the invocation supplies:

- an idempotency key; and
- an approved runtime interrupt bound to the exact tool key and exact input hash.

Approval records a decision; it does not itself execute the tool.

## Replay and resume

Native pause/resume now requires a pinned manifest. Controlled replay requires a source manifest and copies it to the child replay run before the replay checkpoint is created. It never resolves the replay against today's agent/tool definitions.

The TypeScript runtime verifies the current deployment identity before checkpoint, interrupt, resume or replay. Runtime drift therefore fails closed.

## Initial production adoption

The profiling executor is the first real tool path on this guardrail. It now uses pinned contracts for admission and input/output enforcement.

This is deliberately not a claim that every existing agent/tool has migrated. Governance specialist/read agents and other executors can adopt the same manifest primitive incrementally. Their adoption remains a tracked gap until wired and certified.

## Capability assessment

| Capability | Status after this slice | Notes |
|---|---|---|
| Per-run agent definition pinning | PARITY / NATIVE ADVANTAGE | Immutable private snapshot + hashes |
| Deployment/runtime version pinning | PARITY | Fail-closed on version drift |
| Tool schema pinning | PARITY | Existing registry contracts copied immutably per run |
| Pre-tool input guardrail | PARITY | Deterministic native validator; unknown schema features fail closed |
| Post-tool output guardrail | PARITY | Contract validation required before success evidence |
| Executor authorization | NATIVE ADVANTAGE | Pinned executor identity + current administrative kill switch |
| Side-effect approval binding | NATIVE ADVANTAGE | Exact input hash + governed interrupt |
| Tool invocation evidence | NATIVE ADVANTAGE | Immutable hash-only ledger; no raw payload replication |
| Exact replay semantics | PARTIAL | Manifest is preserved; arbitrary side-effect replay remains intentionally uncertified |
| Every-agent adoption | GAP_REQUIRED | Profiling path adopted first |
| Cross-deployment compatible resume | GAP_REQUIRED | Current behavior intentionally fails closed; explicit compatibility certification is future work |
| Full JSON Schema vocabulary | GAP_DEFERRED | Current production schema vocabulary is covered; unsupported keywords fail closed |

## Truth boundary

This slice does not claim:

- that every DataNexus agent uses the native runtime manifest yet;
- that non-idempotent side effects are generally replay-safe;
- that deployment changes are automatically compatible with paused runs;
- that tool success can be inferred when output validation fails;
- that invocation hashes reconstruct raw input/output;
- that runtime state replaces `orchestration.durable_jobs` as business-job authority.
