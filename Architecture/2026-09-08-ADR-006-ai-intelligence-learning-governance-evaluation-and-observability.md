# ADR-006: AI Intelligence, Learning, Governance, Evaluation and Observability Architecture

**Date:** 2026-09-08  
**Status:** Accepted architecture direction  
**Architecture version:** 1.3 candidate

## Decision summary

DataNexus AI will treat models as replaceable workers inside a governed intelligence architecture. No single LLM, embedding model, reranker, agent framework, search engine, or ML implementation becomes the product architecture.

The platform will establish stable logical contracts for:

1. Model Gateway and intelligent model routing.
2. ReasoningProvider for replaceable reasoning models.
3. RetrievalProvider combining lexical, semantic, graph, temporal and authority-aware retrieval.
4. Dedicated embedding and reranking models.
5. Deterministic rules, statistical methods and specialist ML where they are more appropriate than LLM reasoning.
6. Agent intelligence with explicit reasoning, tools, evidence, verification, memory and governed learning.
7. A Learning Engine that learns from verified outcomes rather than recursively trusting previous AI outputs.
8. An Evaluation Engine for reasoning, retrieval, grounding, agent, model and outcome evaluation.
9. A separate AI Governance Plane and DataNexus AI Command Center.
10. Policy enforcement through a replaceable Policy Decision Point, with Open Policy Agent as the preferred initial candidate when capability requires it.
11. Separate data, platform and AI observability domains using a replaceable TelemetryProvider.
12. PostgreSQL / Supabase as authoritative governance, learning, approval, evidence and audit truth, consistent with ADR-002.

## Context

DataNexus AI is not an LLM wrapper or a profiling-only application. Its target operating loop is:

`Observe → Understand → Detect → Investigate → Decide → Policy / Risk Evaluation → Act → Verify → Learn`

The product direction includes profiling, quality, classification, sensitive-data detection, CDEs, anomaly and drift detection, reconciliation, lineage, impact analysis, governance knowledge, policies and regulations, natural-language investigation, specialist agents, predictive risk, remediation, human approval, governed autonomous action, observability, audit, verification, feedback and learning.

The architecture must therefore separate deterministic truth, statistical detection, probabilistic reasoning, governance authority and learning.

## Core architecture

```text
                         DataNexus AI
                              │
                         Web / API
                              │
                    Natural Language Layer
                              │
                     AI / Model Gateway
                              │
                       Intelligent Router
                              │
      ┌───────────────────────┼────────────────────────┐
      │                       │                        │
 ReasoningProvider      RetrievalProvider       ML / Algorithms
      │                       │                        │
 replaceable LLMs       lexical / semantic      anomaly / drift
                        rerank / graph           forecasting
                        temporal / authority     reconciliation
                              │
                    Agent Intelligence Layer
                              │
                Reason → Tool → Verify → Learn
                              │
                       Learning Engine
                              │
                 Memory / Feedback / Evaluation
                              │
           ┌──────────────────┴──────────────────┐
           │                                     │
     Knowledge Plane                       Evidence Plane
           │                                     │
 policies / metadata                     observations
 cases / graph / RAG                     decisions / actions
                                               verification
           └──────────────────┬──────────────────┘
                              │
                      AI GOVERNANCE PLANE
                              │
                    DataNexus AI Command Center
                              │
       Identity / RBAC / Policy / Risk / Approval / Audit
       Autonomy / Kill / Rollback / Budget / Model Controls
                              │
                     Governed Execution
                              │
                         Verification
                              │
                           Outcome
                              │
                           Learning
```

## 1. Reasoning architecture

DataNexus must not hardwire a permanent reasoning model. A `ReasoningProvider` contract will allow multiple models and deployment modes.

Initial open-model benchmark candidates include Qwen reasoning models, Kimi reasoning models, GLM reasoning models and DeepSeek reasoning models. These are candidates, not architectural dependencies.

Model selection must be based on DataNexus-specific evaluations including:

- root-cause investigation quality;
- governance and policy reasoning;
- tool-use reliability;
- structured-output correctness;
- evidence grounding;
- long-context performance;
- latency;
- cost;
- privacy and deployment constraints;
- verified outcome quality.

The Model Gateway should eventually route by task, sensitivity, risk, context size, tool requirements, latency, cost, model availability and measured evaluation performance.

## 2. Learning architecture

Reasoning and learning are separate concerns. Production agents must not continuously modify model weights from unverified interactions.

Learning levels are:

1. **Working/session learning:** current investigation context.
2. **Episodic learning:** previous investigations, actions and outcomes.
3. **Semantic enterprise learning:** approved facts, policies, mappings and definitions.
4. **Procedural learning:** verified successful investigation or remediation workflows.
5. **Performance learning:** model, prompt, retrieval and tool effectiveness.
6. **Offline model adaptation:** fine-tuning or LoRA only after governed dataset construction, evaluation and approval.

The canonical learning loop is:

`Investigation → Recommendation → Decision → Action → Verification → Outcome → Feedback → Evaluation → Candidate Learning → Promotion → Future Use`

DataNexus learns from verified outcomes, not merely previous AI responses.

Candidate learning must remain distinct from promoted enterprise knowledge. Promotion may require evidence, confidence thresholds, policy checks and human approval depending on risk.

## 3. Governance knowledge model

The Knowledge Plane should support more than policies and documents. Target knowledge domains include:

### Governance knowledge
- policies;
- standards;
- procedures;
- controls;
- regulations and regulatory obligations;
- contracts and data contracts;
- business rules;
- governance frameworks.

### Business knowledge
- glossary and business terms;
- business processes;
- KPIs and metrics;
- domains;
- products and applications;
- organizational context.

### Data knowledge
- datasets, versions, columns and schemas;
- classifications and sensitivity;
- critical data elements;
- ownership and stewardship;
- profiling and quality history;
- rules and violations.

### Technical knowledge
- pipelines and jobs;
- transformations and SQL;
- dbt models where present;
- APIs;
- infrastructure and deployment metadata.

### Relationship knowledge
- lineage;
- dependencies;
- policy-to-requirement-to-control relationships;
- control-to-data mappings;
- business-impact relationships.

### Operational knowledge
- incidents and issues;
- changes and deployments;
- SLA/SLO definitions;
- runbooks;
- troubleshooting knowledge;
- postmortems.

### AI and learning knowledge
- investigations;
- recommendations;
- approvals and rejections;
- actions;
- verification;
- outcomes;
- promoted memories;
- model and retrieval evaluations.

### Risk, security and evidence knowledge
- risk registers and appetite;
- exceptions and waivers;
- control effectiveness;
- audit findings;
- roles, entitlements and access policies;
- privacy requirements;
- source observations, logs, metrics, traces and profile evidence;
- human-confirmed evidence;
- separately labelled AI-inferred evidence.

Knowledge does not imply authority. Retrieved external or inferred knowledge must never silently become authoritative enterprise truth.

## 4. Retrieval intelligence

The retrieval pipeline should support:

`Intent classification → Query rewriting/decomposition → Entity extraction → Metadata filters → Lexical + Semantic + Graph retrieval → Candidate fusion → Authority weighting → Temporal filtering → Reranking → Evidence diversity → Context construction → Reasoning`

Important requirements include:

- hybrid lexical and semantic retrieval;
- dedicated embeddings;
- dedicated reranking;
- graph retrieval for lineage, dependency and governance relationships;
- temporal awareness for effective dates, versions and superseded policies;
- authority scoring based on evidence provenance;
- contextual compression before model invocation;
- citations/evidence identifiers to canonical records;
- retrieval evaluation such as recall, precision, MRR, nDCG, citation correctness and evidence coverage.

Qwen embedding/reranking and BGE-family models are initial open candidates. Selection must be benchmarked using DataNexus governance corpora.

## 5. Deterministic rules, statistical methods and specialist ML

LLMs must not be used where deterministic or specialist methods provide stronger truth or reproducibility.

Representative allocation:

| Capability | Preferred mechanism |
|---|---|
| Null, distinct, cardinality metrics | SQL / deterministic statistics |
| Constraints and referential integrity | Deterministic rules / SQL |
| Schema compatibility | Schema comparison |
| SLA breach | Time and rule engine |
| Freshness | Rules plus time-series analysis |
| Volume anomaly | Statistics / ML |
| Distribution drift | KS, PSI, Wasserstein or equivalent tests |
| Duplicate detection | Exact, fuzzy and entity-resolution methods |
| Structured PII patterns | Regex, checksum and dictionaries first |
| Semantic PII | ML / LLM as additional evidence |
| Authorization | RBAC / ABAC |
| Governance action permission | Policy Decision Point |
| Risk and approval thresholds | Governed risk / policy engine |
| Lineage truth | Evidence-authority rules |
| Quality scoring | Governed deterministic scoring model |
| Retry, timeout and kill | Execution controller |
| Remediation verification | Deterministic checks where possible |
| Cost and resource budgets | Quotas and policy |
| Data exfiltration prevention | Security and policy controls |

LLMs primarily add explanation, synthesis, hypothesis generation, investigation planning, impact reasoning and remediation recommendations around this evidence.

## 6. Agent intelligence and governed learning

The existing Agent Orchestration concept evolves into an Agent Intelligence and Learning Platform.

Each agent operation should explicitly model:

- identity and tenant/project scope;
- goal and task;
- reasoning/planning state;
- permitted tools and data scopes;
- evidence gathered;
- hypotheses and recommendations;
- policy and risk evaluation;
- human approvals where required;
- actions and action results;
- verification;
- outcome;
- feedback;
- candidate learning.

Memory classes are:

- working memory;
- episodic memory;
- semantic enterprise memory;
- procedural memory;
- performance memory;
- forbidden/non-persistable memory.

Agent-discovered information is candidate learning until evidence, verification and governance requirements permit promotion.

## 7. AI Governance Plane and DataNexus AI Command Center

AI governance is a first-class product capability, separate from AI reasoning and observability.

The **DataNexus AI Command Center** should provide governed visibility and control over:

- registered models and model versions;
- agents and their autonomy levels;
- agent permissions and tool scopes;
- active investigations and executions;
- pending human approvals;
- policy decisions and violations;
- high-risk proposed actions;
- model quality, grounding, latency and cost;
- learning candidates and promotion status;
- model routing policies;
- token/cost/resource budgets;
- emergency pause and kill controls;
- permission revocation;
- rollback where supported;
- evaluation thresholds;
- evidence and audit trails.

The governed action path is:

`AI proposal → Identity → Permission → Data classification/criticality → Risk → Policy evaluation → Allow / Require approval / Deny → Execute → Verify → Audit → Learn`

Open Policy Agent is the preferred initial open-source candidate for the Policy Decision Point when this layer becomes active. DataNexus must keep the policy interface replaceable.

AI must never become the final authority for authorization or governance truth.

## 8. Observability architecture

DataNexus observability has three domains.

### Data observability

- quality;
- freshness;
- volume;
- schema;
- distribution and drift;
- lineage;
- reconciliation;
- SLA;
- pipeline health;
- business criticality and impact.

### Platform observability

- API latency and errors;
- database and worker health;
- queue/workflow state;
- connector health;
- resource usage;
- deployments;
- external dependency health.

### AI observability

- model and version;
- agent and run;
- prompt/configuration version;
- reasoning/tool lifecycle metadata appropriate for operational audit without exposing private hidden chain-of-thought;
- tool calls and failures;
- retrieval queries and evidence identifiers;
- reranker outcomes;
- latency, token usage and cost;
- confidence and grounding measures;
- policy decisions and human overrides;
- recommendation acceptance;
- action and verification outcomes;
- learning promotion;
- evaluation results.

Use a replaceable `TelemetryProvider`. PostgreSQL may support the initial workload. ClickHouse remains the scale-out analytical/telemetry plane defined by ADR-002 when measured volume justifies it. OpenTelemetry remains the preferred instrumentation standard.

## 9. AI Evaluation Engine

Evaluation is a first-class subsystem rather than an offline afterthought.

The Evaluation Engine should measure:

- reasoning quality;
- retrieval and reranking quality;
- grounding and citation correctness;
- classification accuracy;
- recommendation quality;
- tool selection and tool execution success;
- agent task completion;
- policy compliance;
- action and verification success;
- human acceptance/rejection/correction;
- business benefit;
- latency and cost;
- performance by model, version, prompt, agent and capability.

Evaluation results feed the Model Registry and Intelligent Router. This permits DataNexus to choose models based on verified DataNexus performance rather than public benchmark reputation alone.

## 10. Model Registry

The registry should eventually represent:

- provider and model identifier;
- version;
- capabilities;
- deployment mode/location;
- context and structured-output/tool support;
- cost and latency characteristics;
- privacy/data-class restrictions;
- permitted agents and operations;
- evaluation scores by capability;
- grounding and verified-success rates;
- lifecycle status.

## 11. Relationship to ADR-002

ADR-002 remains valid.

- PostgreSQL / Supabase remains authoritative for governance, approvals, current agent state, learning truth, audit and canonical business records.
- OpenSearch remains the future scale-up Knowledge Plane when corpus and retrieval requirements justify it.
- ClickHouse remains the future scale-up historical analytics and telemetry plane.
- GraphProvider remains the abstraction for lineage and Data Estate Knowledge relationships.
- Object storage retains originals and large artifacts.
- pgvector remains a valid initial semantic retrieval capability.

ADR-006 adds the intelligence, learning, evaluation, governance and observability contracts above those data-plane boundaries.

## 12. Interactive UI and development AI

AI used to build DataNexus is architecturally separate from AI running inside DataNexus.

Coding models such as Qwen coding models and optional UI prototyping systems may assist repository development, frontend implementation and browser validation. They are development tooling and must not be confused with DataNexus runtime intelligence.

The runtime UI should expose the same governed service operations available to authorized agents, consistent with the architecture principle that operations are callable by both UI and governed AI agents.

## Consequences

### Positive

- avoids vendor/model lock-in;
- supports open-source/free-first deployment;
- provides explicit learning without uncontrolled self-reinforcement;
- makes governance and human control first-class;
- improves explainability and auditability;
- uses deterministic and statistical methods where stronger than generative AI;
- permits model specialization and cost optimization;
- creates a measurable path toward progressive autonomy;
- keeps expensive infrastructure scale-triggered.

### Costs

- introduces additional logical contracts;
- requires evaluation datasets and telemetry discipline;
- requires explicit knowledge authority and learning-promotion semantics;
- requires careful policy and risk design before autonomous execution expands.

## Implementation strategy

Do not deploy every physical component immediately.

Recommended order:

1. Define provider contracts and canonical schemas.
2. Persist model/agent/retrieval/evaluation identifiers in current PostgreSQL structures where practical.
3. Establish deterministic evidence and authority boundaries.
4. Build DataNexus-specific evaluation datasets from real verified cases.
5. Introduce dedicated embedding/reranking only when retrieval capability requires it.
6. Add Agent Intelligence learning structures around verified outcomes.
7. Introduce Command Center controls before expanding autonomous action.
8. Introduce OPA when policy complexity justifies a dedicated PDP.
9. Instrument with OpenTelemetry-compatible telemetry.
10. Scale retrieval to OpenSearch and telemetry/history to ClickHouse only after measured triggers.
11. Consider offline model adaptation only after sufficient high-quality verified learning data exists.

## Decision principle

**DataNexus owns intelligence, evidence, governance, learning, routing and evaluation. Models and infrastructure are replaceable workers behind stable interfaces.**
