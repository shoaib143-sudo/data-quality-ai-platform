# Multi-Platform Governance Automation Operating Baseline

Date: 2026-09-30  
Status: Approved implementation baseline  
Scope: DataNexus multi-platform governance control plane, starting with Informatica and designed for later Collibra, Alation, and other governance providers.

## Decision summary

DataNexus will implement a provider-neutral governance automation control plane rather than separate vendor-specific orchestration stacks.

The operating model is:

```text
Governance intent
  -> canonical governance model
  -> desired state
  -> discover actual state
  -> reconcile / diff
  -> simulate
  -> authorize
  -> policy decision
  -> approval where required
  -> execute through provider adapter
  -> read back
  -> verify
  -> reconcile
  -> persist evidence and audit
```

MCP is an interoperability facade. It must not become the internal execution engine and must not bypass DataNexus authorization, policy, approvals, execution controls, telemetry, or audit.

## Non-negotiable operating rules

1. DataNexus owns governance intent, policy, approval, planning, execution coordination, verification, and evidence.
2. Provider adapters may discover, translate, execute, and verify. They may not make independent governance decisions.
3. Agents and MCP clients must never call vendor APIs directly.
4. Only documented public vendor APIs may be used for production automation.
5. All mutation plans require a deterministic desired-state fingerprint.
6. Significant bulk mutation follows PLAN -> SIMULATE -> AUTHORIZE -> APPLY -> VERIFY -> RECONCILE.
7. Delete is explicit only. Absence from desired state does not imply deletion.
8. Mutations must be idempotent. Re-running an unchanged desired state must converge to NOOP.
9. Retry ownership is centralized in the DataNexus execution runtime. Provider clients must not create nested mutation retry loops.
10. Retries are bounded and restricted to retryable failures such as rate limiting, transient provider errors, and temporary unavailability.
11. Verification is mandatory. An HTTP success code alone does not satisfy completion.
12. Provider credentials stay server-side and are referenced by connection identity, never passed in MCP arguments or agent prompts.
13. MCP identity must resolve to a DataNexus user or service principal and may not exceed the authority of that principal.
14. Existing DataNexus authorization capabilities, PolicyDecisionProvider, approval model, PAUSE/KILL execution controls, telemetry, durable jobs, and evidence systems must be reused.
15. Provider-specific limits such as batch size, concurrency, async behavior, consistency model, rollback support, and rate limits belong in the provider capability manifest.
16. Provider-specific object identifiers and DTOs must not leak into the canonical governance model.
17. Semantic mapping and API transport are separate adapter concerns.
18. Unsupported provider capabilities must fail explicitly as UNSUPPORTED and may generate a guided/manual task. No undocumented workaround is allowed.
19. Partial failures must preserve checkpoints and evidence and retry only the unresolved scope.
20. Drift must be reported before automatic reconciliation unless an existing governed policy explicitly permits automated reconciliation.

## Control plane and execution plane

### DataNexus control plane

Owns:

- canonical governance model;
- desired state;
- provider projections;
- capability registry;
- actual-state discovery orchestration;
- diff and reconciliation;
- dependency graph planning;
- simulation;
- authorization;
- risk classification;
- policy decisions;
- approvals;
- durable execution state;
- retries and rate-limit handling;
- checkpointing;
- compensation decisions;
- verification;
- drift detection;
- semantic-loss reporting;
- telemetry;
- immutable evidence and audit.

### Provider execution plane

Each provider may implement:

- authentication and token handling;
- API client transport;
- vendor DTOs;
- pagination;
- vendor-specific bulk mechanisms;
- vendor-specific async polling;
- canonical-to-provider semantic translation;
- provider-to-canonical normalization;
- mutation execution;
- read-back verification.

## Provider capability contract

Each provider must declare support using machine-readable capability metadata, not simple booleans.

Required dimensions include:

- support: FULL | PARTIAL | READ_ONLY | UNSUPPORTED;
- modes: READ | CREATE | UPDATE | DELETE | BULK | SIMULATE;
- consistency: STRONG | EVENTUAL;
- execution: SYNC | ASYNC;
- idempotency: NATIVE | DATANEXUS_MANAGED | NONE;
- rollback: NATIVE | COMPENSATING | NONE;
- verification: READ_BACK | JOB_STATUS | EVENT | MANUAL;
- constraints: max batch size, concurrency, rate-limit hints, and API version;
- known limitations.

## Provider projections

Canonical DataNexus objects are separate from provider projections.

A canonical object may have zero, one, or multiple provider projections.

```text
Canonical Business Term
  -> Informatica projection
  -> Collibra projection
  -> Alation projection
```

Each projection records at least provider, connection ID, canonical object ID, provider object ID, provider/API version, last observed fingerprint, last observed time, and synchronization state.

Synchronization states:

```text
IN_SYNC
DRIFTED
MISSING
UNSUPPORTED
```

## Required mutation lifecycle

```text
DISCOVER
  -> PLAN
  -> SIMULATE
  -> AUTHORIZE
  -> APPLY
  -> VERIFY
  -> RECONCILE
```

If a provider supports a native dry run, use it. Otherwise DataNexus simulation validates schema, references, capabilities, dependencies, authority, semantic-loss risk, and planned API calls without mutation.

## Idempotency

Every mutating operation must carry:

- plan ID;
- operation ID;
- idempotency key;
- desired-state fingerprint;
- provider;
- provider connection;
- canonical object identity.

Repeated submission of the same approved plan must not create duplicate provider state.

## Retry and failure handling

The DataNexus execution runtime owns retries.

Retryable:

- RATE_LIMITED;
- TRANSIENT_FAILURE;
- PROVIDER_UNAVAILABLE.

Non-retryable without a new plan or changed input:

- VALIDATION_FAILED;
- AUTHORIZATION_DENIED;
- UNSUPPORTED_CAPABILITY;
- deterministic CONFLICT.

Use bounded exponential backoff with jitter.

## Bulk execution

Bulk handling is generic. Providers advertise constraints, and DataNexus chooses batch size and safe parallelism.

Required properties:

- bounded concurrency;
- provider-specific batch limits;
- checkpoint persistence;
- partial-failure isolation;
- retry of unresolved operations only;
- operation-level evidence;
- final reconciliation.

## Compensation

Classify mutations as:

- REVERSIBLE;
- COMPENSATABLE;
- IRREVERSIBLE.

Do not assume transactional rollback across provider APIs.

Higher-risk or irreversible operations must flow through the existing DataNexus approval model.

## MCP operating boundary

DataNexus exposes one governance MCP facade generated from canonical capabilities.

Preferred semantic MCP operations:

- governance.providers;
- governance.capabilities;
- governance.discover;
- governance.plan;
- governance.simulate;
- governance.apply;
- governance.verify;
- governance.status.

MCP clients do not receive direct vendor credentials and do not invoke provider endpoints directly.

## Initial provider sequence

1. Informatica as the reference provider.
2. Collibra after the shared provider framework is proven.
3. Alation after the shared provider framework is proven.
4. Additional providers only through the same provider SDK and conformance suite.

## Informatica implementation order

### Wave 1

Read-only:

- catalog search and asset read;
- glossary read;
- lineage read;
- quality-result read;
- execution/status read.

### Wave 2

Governed mutation where supported:

- business/glossary asset create and update;
- relationship create/update;
- classification assignment;
- stewardship assignment;
- publish.

### Wave 3

Bulk:

- provider-native bulk operations where available;
- generic DataNexus batching otherwise;
- checkpointing;
- partial retry;
- verification.

### Wave 4

Broader supported API automation:

- policies;
- DQ management and execution;
- source/catalog operations;
- scans;
- workflows;
- administration operations only where public APIs support them.

## Release gates

A provider is not production-ready until it passes:

- provider manifest validation;
- authentication and credential-boundary tests;
- capability declaration tests;
- read/create/update/delete tests for declared capabilities;
- duplicate-create and idempotency tests;
- NOOP rerun;
- bulk and partial-failure tests;
- rate-limit and timeout tests;
- authorization and policy denial tests;
- approval-required path;
- PAUSE/KILL enforcement;
- checkpoint resume;
- verification mismatch handling;
- compensation behavior;
- semantic-loss reporting;
- cross-project and cross-tenant isolation;
- existing DataNexus regression suites.

## Operational caution

Do not store vendor secrets, tokens, client secrets, private keys, or tenant credentials in this repository.

Time-sensitive API limits and provider behavior must be revalidated against current official vendor documentation before production activation.

## Completion definition

The reference implementation is considered complete only when the shared canonical model, provider SDK, desired-state and reconciler engine, governed execution path, verification, evidence, MCP facade, Informatica provider, E2E tests, negative/failure-path tests, and existing DataNexus regression gates all pass.
