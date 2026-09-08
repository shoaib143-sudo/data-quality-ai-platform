# DataNexus AI Intelligence, Learning, Governance and Observability Discussion

**Date:** 2026-09-08  
**Status:** Strategic discussion captured and promoted into ADR-006

## Purpose

This document captures the design discussion that expanded the DataNexus AI recommendation beyond UI generation, profiling and a single reasoning model. The discussion was validated against the existing product direction, 75-capability AI matrix, ADR-002 polyglot architecture and the broader autonomous-governance objective.

The resulting architecture decision is recorded in:

`Architecture/2026-09-08-ADR-006-ai-intelligence-learning-governance-evaluation-and-observability.md`

## Discussion outcome

DataNexus should not be designed around one permanent LLM. The product requires a governed intelligence architecture combining reasoning models, learning, retrieval, reranking, graph and temporal context, deterministic rules, statistical/ML detection, specialist agents, evaluation, observability and an explicit AI governance plane.

The central product loop remains:

`Observe → Understand → Detect → Investigate → Decide → Policy / Risk Evaluation → Act → Verify → Learn`

## 1. Reasoning models and learning

The reasoning layer should be replaceable and benchmarked using real DataNexus tasks. Initial open-model families worth evaluating include Qwen reasoning models, Kimi reasoning models, GLM reasoning models and DeepSeek reasoning models.

The key correction is that reasoning and learning are not the same capability.

DataNexus learning should include:

- working/session context;
- episodic memory of previous investigations and outcomes;
- approved semantic enterprise knowledge;
- procedural learning from verified successful workflows;
- performance learning for models, prompts, tools and retrieval strategies;
- optional offline fine-tuning/LoRA only after governed evaluation.

Production AI should learn from verified outcomes rather than treating previous AI answers as truth.

## 2. Governance knowledge scope

The knowledge architecture should include:

- policies, standards, procedures, controls and regulations;
- regulatory obligations, contracts and data contracts;
- business rules, glossary, KPIs, processes and domains;
- datasets, columns, schemas, classifications, CDEs and ownership;
- profiling, quality history, rules and violations;
- pipelines, transformations, SQL, APIs and infrastructure metadata;
- lineage and dependency relationships;
- incidents, issues, deployments, runbooks and postmortems;
- investigations, recommendations, approvals, actions and outcomes;
- risk registers, exceptions, waivers and audit findings;
- access policies, privacy requirements and entitlements;
- source observations, logs, metrics, traces and other evidence.

Knowledge must retain provenance, authority, version and temporal context. AI-inferred knowledge remains separately labelled and cannot silently become authoritative truth.

## 3. Retrieval beyond embeddings

Dedicated embeddings and reranking remain recommended, but DataNexus retrieval should eventually combine:

- intent classification;
- query rewriting and decomposition;
- entity extraction;
- metadata filtering;
- lexical/BM25 search;
- semantic/vector retrieval;
- graph retrieval;
- temporal filtering;
- authority weighting;
- candidate fusion;
- reranking;
- contextual compression;
- evidence diversity;
- citation/evidence mapping.

Qwen embedding/reranking and BGE-family models are candidates to benchmark against a DataNexus governance retrieval test set.

Retrieval quality itself must be evaluated rather than assumed.

## 4. Do not use LLMs for everything

A major design principle is to choose the strongest mechanism for each task.

Examples:

- profiling metrics: deterministic SQL/statistics;
- referential integrity: deterministic rules;
- schema drift: schema comparison;
- freshness/SLA: time and rule engines;
- anomaly detection: statistical/ML methods;
- distribution drift: statistical tests;
- duplicates: exact/fuzzy/entity-resolution methods;
- structured PII: regex/checksum/dictionaries first;
- authorization: RBAC/ABAC;
- governance action permission: policy engine;
- quality and risk scoring: governed deterministic formulas/models where possible;
- retries, timeouts and kill actions: execution controller;
- verification: deterministic checks where possible.

LLMs should explain, synthesize, investigate, hypothesize, reason about impact and recommend actions around this evidence.

## 5. Agents require reasoning and learning

The Agent Orchestration concept should evolve into an Agent Intelligence and Learning Platform.

Agents need explicit:

- identity and scope;
- reasoning and planning;
- permitted tools;
- evidence;
- policy/risk evaluation;
- actions;
- verification;
- outcomes;
- feedback;
- memory;
- candidate learning.

Memory should distinguish working, episodic, semantic, procedural, performance and non-persistable information.

Agent-discovered information must pass a promotion process before becoming enterprise knowledge.

## 6. AI Governance Plane and DataNexus AI Command Center

This is a separate first-class product capability.

While AI runs in the background, DataNexus must expose visible governance and control through a Command Center covering:

- models and versions;
- agents and autonomy levels;
- agent/tool/data permissions;
- running investigations and actions;
- pending approvals;
- policy decisions;
- high-risk actions;
- model quality and grounding;
- learning candidates;
- routing and budgets;
- emergency pause/kill;
- rollback;
- audit and evidence.

The action boundary is:

`AI proposal → Identity → Permission → Classification/Criticality → Risk → Policy → Allow / Approval / Deny → Execute → Verify → Audit → Learn`

Open Policy Agent is the preferred initial open-source policy-engine candidate when a dedicated Policy Decision Point becomes necessary. The interface should remain replaceable.

## 7. Observability architecture

Three domains are required.

### Data observability

Quality, freshness, volume, schema, distribution, drift, lineage, reconciliation, SLA, pipeline health and business impact.

### Platform observability

APIs, databases, workers, queues/workflows, connectors, resources, deployments and dependencies.

### AI observability

Models, versions, agents, prompt/configuration versions, tool calls, retrieval, reranking, evidence identifiers, latency, tokens/cost, grounding, policy decisions, human overrides, recommendation acceptance, actions, verification, learning promotion and evaluation.

PostgreSQL can support the initial scale. ADR-002's ClickHouse analytical/telemetry projection remains the preferred scale-out path when measured workload justifies it. OpenTelemetry remains the preferred instrumentation standard.

## 8. Evaluation as a first-class subsystem

A DataNexus AI Evaluation Engine should measure:

- reasoning quality;
- retrieval/reranking quality;
- grounding and citation correctness;
- classification accuracy;
- recommendation quality;
- tool selection/execution;
- agent completion;
- policy compliance;
- action and verification success;
- human acceptance and correction;
- business benefit;
- latency and cost.

Evaluation feeds the Model Registry and Intelligent Router so model choice can be based on verified DataNexus performance rather than public benchmarks alone.

## 9. Model Gateway and registry

The AI/Model Gateway should eventually route using task, sensitivity, risk, context size, tool needs, latency, cost, privacy, deployment location, model availability and evaluation score.

The Model Registry should record provider, model/version, capabilities, deployment, privacy restrictions, allowed data classes/agents, evaluation scores, grounding, verified success, latency/cost and lifecycle status.

## 10. Interactive UI conclusion

AI used to build DataNexus and AI used inside DataNexus are separate concerns.

Coding models and optional UI-generation/prototyping systems can accelerate development of the existing Next.js application. Runtime intelligence must use the governed architecture described above.

The DataNexus UI should progressively expose interactive evidence paths such as:

`Estate → Domain → Dataset → Version → Profile → Column → Metric → Finding → Evidence → Impact → Recommendation → Governed Action → Verification`

and provide the AI Command Center for oversight of background AI operations.

## Final agreed architecture principles

1. No permanent single-LLM dependency.
2. Reasoning and learning are separate first-class concerns.
3. Learning is outcome-verified and governance-gated.
4. Retrieval is hybrid, graph-aware, temporal and authority-aware.
5. Embeddings and reranking are dedicated replaceable capabilities.
6. Deterministic/statistical/ML methods are preferred where they provide stronger truth.
7. Agents combine reasoning, tools, evidence, verification, memory and learning.
8. AI governance is a separate plane.
9. The DataNexus AI Command Center provides human oversight and emergency control.
10. OPA is the preferred initial dedicated policy-engine candidate when needed.
11. Data, platform and AI observability are distinct but correlated.
12. Evaluation is continuous and feeds model/routing decisions.
13. PostgreSQL/Supabase remains authoritative.
14. OpenSearch and ClickHouse remain scale-triggered projections under ADR-002.
15. DataNexus owns intelligence, evidence, governance, learning, routing and evaluation; models remain replaceable workers.
