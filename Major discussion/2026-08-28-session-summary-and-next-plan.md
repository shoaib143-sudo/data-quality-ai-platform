# DataNexus AI Session Summary and Tomorrow Plan

**Date:** 2026-08-28
**Purpose:** Preserve the important strategic and implementation decisions from today's discussion and establish the starting point for the next implementation session.

## 1. Product direction

Product name: **DataNexus AI**.

Long term positioning:

> Start as an AI powered Data Intelligence platform, build trusted intelligence and confidence, then transition toward an Autonomous Data Governance platform.

The ultimate goal is **fully autonomous AI**, but autonomy must initially operate with human guard rails and progressively expand as evidence, confidence, policy controls and verification mature.

## 2. Capture first, reconcile second

The project documentation rule is:

> **Capture as much useful information as possible first. Reconcile later.**

Do not prematurely discard ideas because they appear minor, duplicated or out of current scope. During reconciliation they can be classified as current, priority, deferred, superseded, rejected, historical, duplicate or low value.

Fruitful discussions, examples, alternatives, business scenarios, architecture ideas, infrastructure options, AI capabilities and implementation discoveries must not be lost.

When an old idea is superseded, preserve it and append the new direction with context.

## 3. Strategic target data

Production criticality should prioritise:

1. Critical datasets
2. Critical data elements
3. Regulatory data
4. PII / sensitive data
5. Financial data
6. Customer data
7. Operational data

The platform should ultimately support **all data source types**.

Initial sources:

- CSV
- Database tables

Database priority:

1. PostgreSQL / Supabase
2. Databricks

Unstructured data is strategically very important, particularly policies, standards, procedures, regulations and other governance material. It is a later expansion area after the initial CSV and database table workflow is established.

## 4. Database onboarding workflow

The agreed database profiling flow is:

**Connection configuration → encrypted credential storage → connection test → schema/table discovery → profiling**

This should be designed as a connector abstraction so additional database and warehouse technologies can be added without redesigning the profiling engine.

Multi tenancy is required.

Credentials must be isolated per tenant and must not be exposed to AI agents as unrestricted secrets.

## 5. First AI agent

The first specialist agent should be the:

**Data Profiling Investigation Agent**

It should not initially be a generic unrestricted agent.

Its target workflow is:

**Detect → investigate → gather evidence → understand profile → explain → identify probable root cause → assess impact → recommend action → request approval where required → verify outcome**

The agent should progressively gain access to profiling, metadata, logs, lineage, policies and other governed tools.

## 6. Autonomy principle

Final principle:

> **Autonomous does not mean unrestricted. It means the AI can independently complete an action within a predefined policy boundary.**

Initial safe automation:

- Generate descriptions
- Suggest rules
- Classify columns
- Detect anomalies
- Generate profiling summaries

Human approval initially required for:

- Modify data
- Delete records
- Change schemas
- Execute remediation
- Change governance policies
- Alter production pipelines

Future autonomy should be risk and policy based, with explicit permissions, evidence, confidence, verification and auditability.

## 7. AI capability breadth

The AI capability exploration now contains a preserved matrix of **75 capabilities/use cases** in `Major discussion/2026-08-28-ai-capability-matrix.md`.

The matrix includes profiling, classification, sensitive data detection, CDE identification, rule generation, quality scoring, anomaly and drift detection, root cause analysis, reconciliation, business rule detection, policy interpretation, regulatory mapping, metadata enrichment, lineage and impact analysis, incident management, risk prediction, remediation recommendations, AI agents, natural language investigation, RAG, policy aware AI, risk aware autonomy, evidence, audit, confidence, learning, agent monitoring, job termination, diagnostic logs, continuous governance and data estate intelligence.

Representative scenarios preserved in the matrix include:

- Critical customer dataset completeness degradation
- Regulatory data distribution drift
- Long running job requiring controlled termination
- Job stuck at 100% but not terminal
- Unstructured policy converted into candidate governance controls

## 8. Monitor / AI Operations Center

The Monitor should eventually become more than a job monitoring page.

Users should primarily come to it **when something needs attention or fixing**, rather than merely to watch jobs.

Core philosophy:

> **"Here are the things in your data estate that need your attention, why they matter to the business, what is causing them, what DataNexus AI recommends doing, and what business benefit you get from fixing them."**

Therefore the Operations Center should eventually focus on:

- Issues requiring attention
- Technical problem
- Root cause / investigation status
- Underlying business issue
- Business impact
- Regulatory impact
- Financial impact where measurable
- Operational impact
- Customer impact
- Risk if ignored
- AI recommendation
- Required human approval
- Expected business benefit
- Remediation status
- Verification result
- Actual outcome
- Evidence and confidence
- Audit trail

## 9. Business value is the destination

The technical layer is necessary, but the product must ultimately showcase business benefits.

Core value chain:

**Data → Profile → Understand → Detect → Investigate → Explain → Business Issue → Business Impact → Risk → Recommend → Act → Verify → Measure Value**

DataNexus AI should eventually measure not only quality improvement but business outcomes such as:

- Avoided operational cost
- Reduced investigation hours
- Reduced incidents
- Reduced customer impact
- Improved SLA performance
- Reduced regulatory exposure
- Improved critical dataset quality
- Reduced manual remediation
- Financial exposure avoided or recovered where measurable

An executive should eventually see statements such as:

> DataNexus AI identified potential business exposure, traced the problem to its likely source, recommended a corrective action, verified the fix and measured the resulting benefit.

The product should **measure technical quality but sell business value**.

## 10. Existing implementation context

The Monitor work has already covered operational capabilities including:

- Job monitoring
- Drill down into executions
- Termination controls
- Lifecycle persistence for terminated jobs
- Log extraction / diagnostic workflows
- Improved monitoring UI and visual hierarchy
- Safer project access handling
- Lifecycle log handling
- Timestamp handling for malformed or missing lifecycle log timestamps

Known historical issues included missing `agent.agent_run_logs`, project membership schema mismatch, missing service role configuration, diagnostic downloads remaining in preparation, no matching logs, and invalid lifecycle timestamps. These should be treated as implementation history and regression considerations, not as reasons to stall the broader product roadmap.

## 11. Tomorrow's implementation starting point

### Step 1: Reconcile before coding

At the start of tomorrow's session:

1. Read the Major Discussion documentation.
2. Read the latest Architecture documentation.
3. Inspect current Git history and working tree.
4. Identify the current implemented state of monitoring, profiling and job execution.
5. Compare documented direction against the actual code and schema.
6. Identify drift, gaps and the smallest complete next vertical slice.

### Step 2: Establish the first complete user journey

Prioritise the first end to end workflow:

**CSV upload → dataset registration → profiling → profiling results → quality observations → business interpretation → recommendation → persisted profiling outcome**

The objective is to make DataNexus AI genuinely useful for a real user, not just continue adding infrastructure.

### Step 3: Design database profiling around the agreed onboarding flow

Build the abstraction for:

**Connection configuration → encrypted credential storage → connection test → schema/table discovery → profiling**

Start with PostgreSQL / Supabase.

Ensure the abstraction can support Databricks next.

### Step 4: Define the Data Profiling Investigation Agent contract

Before broad agent implementation, define:

- Agent purpose
- Inputs
- Available governed tools
- Evidence model
- Investigation state
- Confidence model
- Recommendation model
- Approval boundary
- Action permissions
- Verification requirements
- Audit events
- Failure and termination behaviour

### Step 5: Start the business value model

Add a durable representation of:

- Technical issue
- Business issue
- Business impact
- Risk
- Recommendation
- Expected benefit
- Actual benefit / outcome
- Evidence
- Confidence

This prevents business value from being bolted onto the product at the end.

### Step 6: Evolve the Monitor toward the Operations Center

Do not spend tomorrow polishing the current Monitor UI unless required for functionality.

Instead, begin designing the data model and information architecture that can support issue centric operations:

**What needs attention → why it matters → evidence → what AI found → what it recommends → approval → action → verification → benefit**

### Step 7: Keep autonomy governed

Every new AI action should declare its autonomy level:

- Observe
- Investigate
- Recommend
- Human approved
- Policy bounded autonomous
- Verify

No unrestricted production action should be introduced.

## 12. Definition of success for the next phase

By the end of the next meaningful implementation phase, a user should be able to provide a CSV or connect to a PostgreSQL / Supabase table, run profiling, see meaningful findings, understand why they matter, receive AI generated explanations and recommendations, and see the results persisted for future monitoring and investigation.

The Data Profiling Investigation Agent should then build on this foundation rather than being a disconnected AI feature.

## 13. Guiding principle for implementation

**Implementation remains the priority.**

Do not repeatedly restate requirements or stall for confirmation when the direction is already established. Continue actual implementation until the module is complete or a specific technical blocker is found, including the exact file, schema, query, dependency or configuration causing the blocker.

Documentation should support implementation, not replace it.
