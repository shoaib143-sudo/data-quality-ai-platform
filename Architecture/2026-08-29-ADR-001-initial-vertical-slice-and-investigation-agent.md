# ADR-001: Initial Vertical Slice and Data Profiling Investigation Agent

**Date:** 2026-08-29  
**Status:** Accepted  
**Architecture version:** 1.1

## Decision

DataNexus AI will implement its next architecture increment around a complete, issue oriented profiling vertical slice for CSV and database tables.

The first database priorities are PostgreSQL / Supabase followed by Databricks. Database onboarding will use:

**Connection configuration → encrypted credential storage → connection test → schema/table discovery → profiling**

The first specialist agent will be the **Data Profiling Investigation Agent**. It will use governed tools and policy bounded autonomy. The Monitor will evolve toward an AI Operations Center focused on issues requiring attention, business impact, recommendations, actions, verification, and measurable benefits.

## Context

The broad target architecture already separates the web application, AI and agent layer, intelligence layer, data platform, and governance. The latest product decisions now establish the first concrete implementation path and add a stronger requirement to connect technical findings to underlying business issues and benefits.

The platform must not be built as a collection of disconnected AI demonstrations. It needs a useful end to end path that starts with real data, produces evidence based findings, explains why they matter, and creates a foundation for governed investigation and remediation.

## Target architecture increment

```text
                 DataNexus AI Operations Center
                              │
                    Issues needing attention
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
     Evidence and findings                 Business context
          │                                       │
  Profile, quality, drift,                Business issue, impact,
  lifecycle, metadata, logs               risk, benefit, outcome
          │                                       │
          └───────────────────┬───────────────────┘
                              │
                 Data Profiling Investigation Agent
                              │
       Governed tools: profile, metadata, logs, lineage,
       policy retrieval, impact assessment, recommendations
                              │
                 Policy and risk evaluation
                    ┌─────────┴─────────┐
                    │                   │
             Human approval       Safe autonomous action
                    │                   │
                    └─────────┬─────────┘
                              │
                       Execute and verify
                              │
                         Audit and evidence

Sources:
  CSV → dataset registration → profiling
  PostgreSQL / Supabase → secure connection → discovery → profiling
  Databricks → next connector using the same abstraction
```

## Architecture components affected

### Data source and connector layer

Introduce a stable connection abstraction covering configuration, tenant ownership, encrypted credential reference, connection testing, schema discovery, table discovery, and profiling invocation.

The abstraction must not expose raw credentials to the agent layer. Agents receive governed capabilities and scoped references, not unrestricted secrets.

### Profiling and quality layer

The profiling engine must support CSV and database tables through a common profile result contract. Results should persist enough evidence to support later investigation, explanation, comparison, and verification.

### Intelligence and business context layer

Profile findings must support business interpretation fields, including underlying business issue, business impact, risk, recommendation, expected benefit, actual outcome, evidence, and confidence.

### Agent layer

The Data Profiling Investigation Agent should be implemented as a bounded specialist with explicit tools, state, evidence collection, confidence, approval routing, verification, termination, and audit events.

### Operations layer

The Monitor should gradually become an issue centric Operations Center. Jobs remain visible, but the primary unit of attention becomes a data estate issue and its remediation lifecycle.

## Alternatives considered

### Alternative A: Continue with a job first Monitor

**Rejected as the primary direction.** A job first view is useful for operations but does not express why a user should care or what value fixing a problem creates.

### Alternative B: Build a generic autonomous agent first

**Rejected for the initial increment.** Without concrete profiling and evidence capabilities, a generic agent would be difficult to govern, test, and make useful.

### Alternative C: Implement many connectors before the first complete workflow

**Deferred.** CSV and PostgreSQL / Supabase provide the first useful scope. Databricks follows through the connector abstraction. Additional sources remain part of the long term strategy.

### Alternative D: Add business value only after technical monitoring is complete

**Rejected.** Business issue, impact, benefit, outcome, evidence, and confidence are architectural data requirements and must be represented from the beginning.

### Alternative E: Pass database credentials directly to agents

**Rejected.** Credential access must remain isolated, encrypted, tenant scoped, and mediated through governed operations.

## Consequences

### Positive

- A user can reach a complete business oriented outcome from real data.
- Agent development is grounded in actual profiling evidence.
- Databricks can be added without redesigning the profiling engine.
- Monitor evolution is aligned with user value rather than job visibility alone.
- Business benefits and measured outcomes can be captured early.
- Policy bounded autonomy becomes testable and auditable.

### Negative

- The initial implementation requires more durable data modelling than a simple job monitor.
- Secure connection handling and tenant isolation must be addressed early.
- Business value estimation will initially be partly qualitative or confidence qualified.
- The Operations Center will need more than a single execution status model.

## Infrastructure implications

### Required now

- Next.js application
- Supabase Auth
- PostgreSQL / Supabase application database
- Secure tenant scoped connection records
- Existing profiling execution and lifecycle infrastructure
- Persisted evidence and outcome records
- Structured operational logs

### Required when agent execution expands

- Agent orchestration suitable for explicit state and tool governance, with LangGraph remaining a candidate
- Policy evaluation, potentially Open Policy Agent or an equivalent internal policy boundary
- OpenTelemetry based tracing for agent and tool execution
- Controlled termination and verification for long running jobs

### Deferred until justified by scale

- Dedicated metadata catalog
- Dedicated lineage platform
- Full workflow orchestrator
- Centralized metrics, dashboards, logs and tracing stack beyond the minimum needed for reliable operation
- Separate secrets platform such as OpenBao

## Migration impact

This is an additive architecture increment. Existing monitoring, execution lifecycle, and profiling work should remain intact. New data models and service interfaces should be introduced without deleting prior records or replacing historical documentation.

The existing broad source architecture remains valid. This ADR narrows implementation priority, not the long term product boundary.

## Governance requirements

Every agent recommendation or action should preserve:

- Tenant and user context
- Target asset or dataset
- Tool used
- Evidence collected
- Confidence
- Policy evaluation result
- Approval state
- Action and actor
- Verification result
- Audit timestamp

## Follow up decisions

The next implementation session should define the exact data contracts for:

- Profile result
- Quality observation
- Business impact record
- Recommendation
- Approval request
- Agent investigation state
- Verification result
- Audit event

