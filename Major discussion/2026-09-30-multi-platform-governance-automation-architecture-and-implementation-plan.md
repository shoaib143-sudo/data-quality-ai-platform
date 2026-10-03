# Multi-Platform Governance Automation Architecture and Implementation Plan

Date: 2026-09-30  
Status: Approved strategic architecture and implementation baseline  
Reference provider: Informatica  
Planned providers: Collibra, Alation, and other data-governance platforms with supported public APIs.

## Executive objective

DataNexus will evolve into a multi-platform governance implementation and control plane.

The goal is not to build separate Informatica, Collibra, and Alation automation products. The goal is to build one provider-neutral governance language, planner, policy boundary, execution engine, verification model, and evidence model, then attach vendor adapters.

The strategic rule is:

> DataNexus owns governance intent and governed execution. Vendors provide implementation targets.

## Why this architecture

A vendor-specific MCP design would create duplicated policy logic, duplicated tools, duplicated retry behavior, fragmented evidence, and agent coupling to vendor API semantics.

The selected architecture instead separates:

1. governance intent;
2. canonical governance semantics;
3. desired state;
4. actual provider state;
5. reconciliation and planning;
6. capability negotiation;
7. authorization and policy;
8. durable execution;
9. provider translation;
10. verification and evidence;
11. external interoperability through MCP.

This enables Informatica to be the first implementation without making Informatica a dependency of DataNexus core.

## Target architecture

```text
                         Users / AI Agents
                               |
                    +----------+----------+
                    |                     |
               DataNexus UI              MCP
                    |                     |
                    +----------+----------+
                               |
                     Governance Intent API
                               |
                    Canonical Governance Model
                               |
                         Desired State
                               |
                    Actual State Discovery
                               |
                           Reconciler
                               |
                           Diff Engine
                               |
                            Planner
                               |
                          Simulation
                               |
                    Capability Resolver
                               |
                 Authorization + Policy
                               |
                           Approval
                               |
                    Execution Orchestrator
                               |
                 Retry / Batch / Checkpoint
                               |
                         Provider SDK
                               |
          +--------------------+--------------------+
          |                    |                    |
     Informatica           Collibra              Alation
       Provider             Provider              Provider
          |                    |                    |
     Public APIs           Public APIs           Public APIs
          |                    |                    |
          +--------------------+--------------------+
                               |
                           Read Back
                               |
                            Verify
                               |
                           Reconcile
                               |
                       Evidence / Audit
```

## Core design principles

### Reconciler first

The permanent primitive is reconciliation, not command execution.

```text
Desired state
   vs
Actual state
   -> Diff
   -> Plan
   -> Apply
   -> Read back
   -> Reconcile
```

This improves idempotency, drift management, retry safety, migration, and partial-failure recovery.

### Control plane versus provider execution plane

The DataNexus control plane decides what should happen and whether it may happen.

Provider adapters only discover, translate, execute, and verify.

Provider adapters must never independently decide policy, approval, risk, or user authority.

### Canonical semantics

Agents and product features reason over canonical concepts such as:

- GovernanceDomain;
- BusinessTerm;
- TechnicalAsset;
- DataProduct;
- Classification;
- Policy;
- Control;
- Owner;
- Steward;
- Relationship;
- LineageEdge;
- QualityRule;
- QualityResult;
- Certification;
- Workflow;
- Issue;
- Approval.

Provider concepts map to these canonical types.

### Canonical objects and provider projections are separate

A canonical object may project to multiple platforms simultaneously.

```text
Canonical Business Term
  -> Informatica Business Asset
  -> Collibra Business Term / Asset
  -> Alation Glossary Term
```

Provider projections carry vendor identifiers and synchronization state without contaminating canonical objects.

### Provider SDK

The shared provider SDK defines a narrow contract for:

- manifest;
- capabilities;
- discovery;
- execution;
- verification.

Provider-specific transport, DTOs, pagination, authentication, and version quirks stay behind the provider boundary.

### Separate API adapters from semantic adapters

Each provider implementation has two conceptual layers.

API adapter:

- HTTP transport;
- authentication;
- pagination;
- vendor DTOs;
- async jobs;
- API versions;
- vendor error parsing.

Semantic adapter:

- canonical-to-vendor mapping;
- vendor-to-canonical normalization;
- semantic-loss detection;
- provider-specific representational constraints.

An API upgrade should not automatically redefine business semantics.

## Canonical governance model

Recommended initial canonical types:

| Type | Purpose |
| --- | --- |
| GovernanceDomain | Business or governance domain |
| BusinessTerm | Glossary concept |
| TechnicalAsset | Table, column, file, schema, etc. |
| DataProduct | Governed data product |
| Classification | PII, financial, confidential, etc. |
| Policy | Governance policy |
| Control | Policy control |
| Owner | Business ownership |
| Steward | Stewardship |
| Relationship | Semantic relationship |
| LineageEdge | Technical or business lineage |
| QualityRule | DQ specification |
| QualityResult | DQ result |
| Certification | Trust or certification state |
| Workflow | Governance workflow |
| Issue | Governance issue |
| Approval | Approval state |

Canonical objects must have stable DataNexus identity independent from provider object identifiers.

## Desired state

Governance implementations should be declarative.

Example:

```yaml
apiVersion: datanexus.io/governance/v1

targets:
  - informatica-production

domain:
  key: customer
  name: Customer

terms:
  customer-email:
    name: Customer Email
    criticality: CDE
    classifications:
      - PII
    steward: customer-data-steward

quality:
  customer-email:
    completeness:
      threshold: 99.5
```

The same manifest should eventually be portable to Collibra or Alation where equivalent capabilities exist.

## Desired-state safety

Absence is not deletion.

Deleting provider state requires explicit intent such as:

```yaml
state: absent
```

Delete must still pass existing DataNexus authorization, risk, policy, and approval controls.

## External identity and idempotency

Use a stable external identity tuple:

```text
provider
tenant/connection
canonical object type
external key
```

Persist canonical-to-provider object mappings.

Every mutation must include:

- plan ID;
- operation ID;
- idempotency key;
- desired-state fingerprint;
- provider;
- connection ID;
- canonical object ID.

An unchanged manifest rerun must converge to NOOP.

## Capability registry and negotiation

Semantic capability examples:

```text
catalog.asset.read
catalog.asset.create
catalog.asset.update
catalog.asset.delete

glossary.term.read
glossary.term.create
glossary.term.update
glossary.term.delete

governance.domain.create
governance.domain.update

classification.assign
classification.remove

stewardship.assign
stewardship.remove

policy.read
policy.create
policy.update
policy.delete

relationship.create
relationship.update
relationship.delete

lineage.read
lineage.ingest

quality.rule.read
quality.rule.create
quality.rule.update
quality.execute

workflow.start

execution.read
execution.retry
execution.cancel
```

Each provider declares a structured execution contract including:

- FULL | PARTIAL | READ_ONLY | UNSUPPORTED;
- supported modes;
- strong versus eventual consistency;
- sync versus async execution;
- native versus DataNexus-managed idempotency;
- native rollback, compensation, or no rollback;
- verification method;
- batch and concurrency limits;
- API version and known limitations.

This allows the planner to choose an execution strategy from actual provider capabilities.

## Planning and dependency graph

All mutations flow through a deployment plan.

The planner produces a DAG so independent operations can run concurrently while dependencies remain ordered.

Example:

```text
Domain
  -> Terms
      -> Classifications
      -> Stewardship
      -> Relationships
          -> Policies
          -> DQ
              -> Publish
```

The approved plan is fingerprinted. If the plan changes after approval, the approval is invalidated and recalculated.

## Mandatory lifecycle

For meaningful mutations:

```text
DISCOVER
  -> PLAN
  -> SIMULATE
  -> AUTHORIZE
  -> APPLY
  -> VERIFY
  -> RECONCILE
```

Native provider simulation is preferred where available. Otherwise DataNexus performs a no-mutation simulation over schema, references, provider capabilities, dependencies, authority, semantic loss, risk, and planned calls.

## Existing DataNexus controls to reuse

The provider platform must integrate with the existing repository rather than create a parallel governance stack.

Reuse:

- `lib/auth/authorize.ts`;
- existing authorization capability vocabulary;
- Agent Policy v2;
- PolicyDecisionProvider;
- governed approval paths;
- GovernedExecutionController PAUSE/KILL controls;
- provider resilience patterns;
- durable orchestration and worker architecture;
- telemetry;
- immutable evidence and audit;
- lineage ingestion;
- profiling and DQ canonical state;
- Job Monitor and execution evidence patterns.

No provider-specific RBAC layer should be introduced unless an operation cannot be represented by the existing authorization vocabulary.

## Generic bulk execution

Bulk logic belongs in the DataNexus runtime.

The provider supplies constraints such as:

- native bulk support;
- maximum batch size;
- maximum safe concurrency;
- rate-limit hints;
- sync/async behavior.

DataNexus supplies:

- BatchPlanner;
- ConcurrencyLimiter;
- rate-limit coordination;
- retry policy;
- checkpoints;
- partial-failure isolation;
- final reconciliation.

## Retry architecture

Retries must be owned by one layer: the DataNexus execution runtime.

Do not combine independent retries in MCP, orchestrator, provider SDK, and HTTP client for mutations.

Use bounded exponential backoff with jitter for retryable failures.

Canonical error classes should include:

- AUTHENTICATION_FAILED;
- AUTHORIZATION_DENIED;
- VALIDATION_FAILED;
- CONFLICT;
- NOT_FOUND;
- RATE_LIMITED;
- TRANSIENT_FAILURE;
- PROVIDER_UNAVAILABLE;
- UNSUPPORTED_CAPABILITY;
- PARTIAL_FAILURE;
- VERIFICATION_FAILED.

## Verification

An API success response is not completion.

Every mutation requires read-back or equivalent provider verification.

```text
Expected state
  vs
Observed state
  -> VERIFIED
  or
  -> MISMATCH
```

For eventual-consistency providers, verification may use bounded polling or provider job status as declared by the provider manifest.

## Compensation

Use three categories:

- REVERSIBLE;
- COMPENSATABLE;
- IRREVERSIBLE.

Do not assume cross-provider transactional rollback.

The planner must increase risk for irreversible operations and route them through the existing approval model.

## Semantic-loss detection

Cross-platform translation must classify every mapped construct as:

- EXACT;
- APPROXIMATED;
- UNSUPPORTED.

Unsupported or approximated semantics must never be silently discarded.

This is required for provider migration and multi-target governance.

## Multi-target governance

A single canonical object may be deployed to multiple governance platforms.

Example:

```yaml
businessTerm:
  key: customer-email
  name: Customer Email

targets:
  - informatica-production
  - collibra-production
  - alation-production
```

DataNexus independently manages provider projections and drift for each target.

This is strategically more powerful than provider-to-provider migration alone.

## Drift

The reconciler compares desired and actual provider state.

Supported drift categories should include:

- unmanaged external object;
- missing desired object;
- attribute drift;
- stewardship drift;
- classification drift;
- relationship drift;
- policy drift.

Initial modes:

- REPORT;
- RECOMMEND;
- AUTO_RECONCILE where existing policy explicitly permits it.

## MCP architecture

There should be one DataNexus Governance MCP facade, not one independent MCP codebase per vendor.

Preferred semantic MCP operations:

```text
governance.providers
governance.capabilities
governance.discover
governance.plan
governance.simulate
governance.apply
governance.verify
governance.status
```

MCP resources can expose provider capabilities, plans, deployments, and domain context.

MCP identity is delegated into DataNexus and must not exceed the resolved DataNexus principal's project authority.

Provider secrets remain server-side.

## Provider implementation structure

Recommended shape:

```text
lib/
  governance-platform/
    canonical/
    desired-state/
    planning/
    execution/
    reconciliation/
    evidence/
    mcp/
    providers/
      sdk/
      registry.ts
      informatica/
        api/
        semantic/
        provider.ts
        manifest.ts
      collibra/
      alation/
```

The exact file layout may be adjusted to fit current repository conventions, but the dependency boundaries must be preserved.

## Reference provider: Informatica

Informatica is the first real provider and should prove the architecture.

### Wave 1

Read-only:

- catalog search;
- catalog asset read;
- glossary read;
- lineage read;
- quality-result read;
- execution/status read.

### Wave 2

Safe governed mutation where supported:

- business/glossary asset create/update;
- relationships;
- classification assignment;
- stewardship assignment;
- publication.

### Wave 3

Bulk:

- provider-native bulk APIs where supported;
- DataNexus batching otherwise;
- checkpoints;
- partial retries;
- verification.

### Wave 4

Broader supported automation:

- policies;
- DQ rules and DQ execution;
- catalog/source operations;
- scans;
- workflow actions;
- administration operations only where documented public APIs support them.

## Future providers

### Collibra

Expected to benefit strongly from the common provider layer because public APIs include governance resources and bulk import patterns.

### Alation

Expected to benefit from OpenAPI-driven typed clients and capability-specific batch operations.

### Additional platforms

Future vendors must onboard through the same provider SDK, capability manifest, semantic mapping, and conformance suite. No provider may require changes to the core planner, policy engine, evidence model, or MCP architecture unless the canonical model has a genuine cross-provider gap.

## OpenAPI client generation

Where a vendor exposes reliable OpenAPI contracts:

```text
OpenAPI
  -> generated typed client
  -> API adapter
  -> semantic adapter
  -> provider contract
```

OpenAPI may generate transport types and clients. It must not generate governance semantics, policy decisions, delete behavior, risk rules, or semantic equivalence.

## Provider conformance suite

Every provider must pass the same common tests:

- manifest validation;
- capability declaration;
- authentication;
- read/create/update/delete where declared;
- duplicate create;
- idempotent rerun;
- NOOP rerun;
- bulk execution;
- partial batch failure;
- rate limiting;
- timeout;
- provider unavailable;
- authorization denied;
- policy denied;
- approval required;
- PAUSE/KILL;
- checkpoint resume;
- verification success;
- verification mismatch;
- compensation behavior;
- semantic-loss reporting;
- tenant/project isolation.

Provider-specific tests are additional, never substitutes.

## Informatica E2E golden path

```text
Define Customer domain
  -> PLAN
  -> SIMULATE
  -> APPROVE if required
  -> CREATE domain
  -> CREATE terms
  -> ASSIGN classifications
  -> ASSIGN stewards
  -> CREATE relationships
  -> PUBLISH
  -> READ BACK
  -> VERIFY
  -> Data 360
  -> evidence
  -> COMPLETE
```

Immediately rerun the same manifest.

Required result:

```text
CREATE 0
UPDATE 0
DELETE 0
NOOP n
```

## Negative and failure-path E2E

Required scenarios:

- invalid/expired provider credentials;
- missing DataNexus authority;
- wrong project;
- cross-tenant attempt;
- approval required but missing;
- approved plan fingerprint changed;
- provider rate limit;
- provider timeout;
- partial bulk failure;
- execution interrupted after checkpoint;
- provider success response but read-back mismatch;
- unsupported capability;
- PAUSE;
- KILL;
- compensation failure;
- eventual-consistency verification timeout;
- semantic-loss warning;
- manual-only capability.

All must fail closed where authority or correctness is uncertain.

## Five parallel implementation workstreams

| Workstream | Scope |
| --- | --- |
| WS1 Canonical Platform | canonical model, provider projections, desired state, identity, capability registry |
| WS2 Provider Framework | provider SDK, manifests, API/semantic adapter boundary, normalized errors, provider registry |
| WS3 Planner and Runtime | reconciler, diff, DAG planner, batching, retry, checkpoint, compensation |
| WS4 Informatica and MCP | Informatica API mapping, provider implementation, MCP facade and identity |
| WS5 Assurance | unit/integration/E2E, negative cases, evidence, telemetry, Job Monitor integration, regression gates |

Testing begins with implementation, not after implementation.

## Implementation gates

1. Architecture contracts frozen.
2. Canonical model and provider projections.
3. Provider SDK and capability contract.
4. Desired-state validation and diff engine.
5. Read-only Informatica provider.
6. Governed Informatica mutation.
7. Bulk and checkpoint execution.
8. Verification and drift.
9. MCP facade.
10. Full E2E and negative/failure-path suite.
11. Existing DataNexus regression closure.

## Completion criteria

The first implementation is complete only when:

- canonical provider-neutral model exists;
- provider projections exist;
- provider SDK and registry exist;
- desired-state schema exists;
- reconciler and diff engine exist;
- DAG planner exists;
- simulation exists;
- generic batching/checkpoints/retries exist;
- verification and drift exist;
- semantic-loss reporting exists;
- Informatica selected read and mutation capabilities work;
- bulk execution works where supported;
- DataNexus authorization and policy boundaries are enforced;
- approvals and PAUSE/KILL are enforced;
- evidence and telemetry are persisted;
- MCP facade works without bypassing governance;
- unit, integration, negative, failure-path, idempotency, bulk, security, drift, and E2E tests pass;
- relevant existing DataNexus regression gates pass.

## Strategic outcome

The target is not merely that DataNexus can connect to Informatica.

The target is:

> DataNexus becomes the provider-neutral governance implementation, reconciliation, and control plane that can discover, plan, safely deploy, verify, and continuously govern supported capabilities across Informatica, Collibra, Alation, and future platforms.

This architecture should be treated as the baseline for implementation unless a verified provider API limitation or a repository-level technical constraint requires an explicit architecture amendment.
