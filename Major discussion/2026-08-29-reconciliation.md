# DataNexus AI Reconciliation Record

**Date:** 2026-08-29
**Status:** Durable reconciliation record
**Scope:** Decisions and implementation direction captured since the previous reconciliation

## Summary

The project confirmed that documentation must preserve the broadest useful record first, then reconcile and classify later. The latest product direction is now more explicit: the first product experience should focus on CSV and database tables, the first database priorities are PostgreSQL / Supabase followed by Databricks, the first specialist agent is the Data Profiling Investigation Agent, and the Monitor should evolve into an issue centric AI Operations Center that explains business consequences and benefits.

## Confirmed decisions

### Product scope

Initial source types:

1. CSV
2. Database tables

The platform remains intended to support all source categories over time, including unstructured documents and logs.

### Database priority

1. PostgreSQL / Supabase
2. Databricks

### Database profiling onboarding

The standard flow is:

**Connection configuration → encrypted credential storage → connection test → schema/table discovery → profiling**

This flow must be tenant aware, secure, and implemented behind a connector abstraction so Databricks and later systems can be added without redesigning the profiling engine.

### First AI agent

The first specialist agent is the **Data Profiling Investigation Agent**. It is not a generic unrestricted agent.

Its intended workflow is:

**Detect → investigate → gather evidence → understand profile → explain → identify probable root cause → assess impact → recommend action → request approval where required → verify outcome**

### Autonomy

The confirmed definition is:

> Autonomous does not mean unrestricted. It means the AI can independently complete an action within a predefined policy boundary.

Every AI action should declare its autonomy stage:

- Observe
- Investigate
- Recommend
- Human approved
- Policy bounded autonomous
- Verify

Initial human approval remains required for changes to data, record deletion, schema changes, remediation execution, governance policy changes, and production pipeline changes.

## Monitor and Operations Center direction

The Monitor should become more than a job monitor. Users should open it when something in the data estate needs attention or fixing, not simply to watch jobs.

The core user promise is:

> Here are the things in your data estate that need your attention, why they matter to your business, what is causing them, what DataNexus AI recommends doing, and what business benefit you get from fixing them.

The Operations Center should therefore be issue centric and show:

- Technical issue
- Probable root cause
- Underlying business issue
- Business impact
- Regulatory impact
- Financial impact where measurable
- Operational impact
- Customer impact
- Risk if ignored
- Recommended action
- Approval requirement
- Remediation status
- Verification result
- Expected benefit
- Actual benefit or measured outcome
- Supporting evidence
- Confidence
- Audit history

## Business value principle

The product must showcase business benefits, not stop at technical quality metrics.

The intended chain is:

**Data → Profile → Understand → Detect → Investigate → Explain → Business Issue → Business Impact → Risk → Recommend → Act → Verify → Measure Value**

Examples of value measures include:

- Avoided operational cost
- Reduced investigation hours
- Fewer incidents
- Reduced customer impact
- Improved SLA performance
- Reduced regulatory exposure
- Improved critical dataset quality
- Reduced manual remediation
- Financial exposure avoided or recovered where measurable

The strategic product principle is:

> Measure technical quality, but sell business value.

## Important examples preserved

### Customer completeness issue

A drop in customer email completeness should be explained as a business issue, not only a percentage change. The platform should connect the data defect to customer communications, affected records, operational workload, customer impact, regulatory risk where applicable, a recommendation, expected benefit, and verified recovery.

### Long running or stuck job

A profiling or agent job that runs for an extended period, or reaches 100% progress without reaching a terminal state, is both an operational issue and a future agent investigation scenario. The system must preserve lifecycle correctness, support controlled termination, expose diagnostics, and allow the Data Profiling Investigation Agent to gather evidence and explain the inconsistency.

## Reconciliation and preservation rule

The baseline is to capture as much useful information as possible. During reconciliation, material may be classified as current, priority, deferred, superseded, rejected, historical, duplicate, or low value. Useful ideas and examples must remain traceable. No older idea should be deleted merely because a newer direction is preferred.

No idea from this record is marked rejected. The earlier broad capability inventory remains active as the strategic capability universe. The newly confirmed CSV and database first scope is a prioritisation decision, not a rejection of later source types or capabilities.

## Implementation implications

1. The first implementation target should be a complete CSV profiling vertical slice that persists meaningful findings.
2. The data model should support business issue, business impact, risk, recommendation, expected benefit, actual outcome, evidence, and confidence from the beginning.
3. Database connectivity should be designed as a secure, tenant isolated connection resource rather than credentials embedded in individual jobs.
4. The profiling engine should expose stable operations callable from both the UI and governed agents.
5. The Data Profiling Investigation Agent should be built on top of real profiling, metadata, logs, and lifecycle capabilities.
6. The Monitor information architecture should be designed around issues requiring attention, not around a list of jobs.
7. Every action path must include approval, policy evaluation, verification, and audit hooks where relevant.
8. Databricks should be treated as the next connector priority after PostgreSQL / Supabase, with the abstraction designed now.

## Starting point for the next implementation session

Before coding:

1. Reconcile Major discussion documentation.
2. Review Architecture documentation.
3. Inspect current Git history, code, and schema.
4. Compare documented capability against actual implementation.
5. Identify the smallest complete vertical slice that can produce business oriented profiling intelligence.

Then implement in this order:

1. CSV dataset registration and profiling path
2. Persisted profile and quality observations
3. Business interpretation fields
4. Recommendation and outcome model
5. Secure PostgreSQL / Supabase connection abstraction
6. Data Profiling Investigation Agent contract and governed tools
7. Issue centric Operations Center foundations

## Future questions retained for later reconciliation

- Exact business value calculation methods by issue type
- How financial exposure should be estimated and qualified
- Which remediation actions can become policy bounded autonomous actions first
- Exact Databricks authentication and connectivity model
- Whether a dedicated policy engine is required in the first agent release
- Which operational signals should create an Operations Center issue automatically

These are open questions, not blockers for the initial CSV and PostgreSQL / Supabase vertical slice.
