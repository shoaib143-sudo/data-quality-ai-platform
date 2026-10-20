# AI App Stack Capability Assessment

Date: 2026-10-04
Status: implementation guidance for DataNexus

## Decision

The reference AI stack is useful as a capability checklist, not as a dependency list. DataNexus must preserve its native governed runtime and add external products only behind provider or Capability Broker contracts when they close a measured gap.

## Coverage

| Reference category | DataNexus status | Decision |
| --- | --- | --- |
| LLM / core models | Implemented | Keep provider-neutral ModelGateway and reasoning provider. Do not couple runtime to a single vendor. |
| Agentic AI | Implemented / being strengthened | Native autonomy runtime, supervisor, governed handoffs and hierarchical workflow runtime remain authoritative. Do not add LangGraph, CrewAI or AutoGen as a second orchestration plane. |
| RAG | Implemented | Governed retrieval supports semantic, lexical, graph, temporal and authority-aware retrieval plus evaluation. Extend providers only through existing interfaces. |
| Embeddings | Implemented | Provider abstraction, embedding-space identity and semantic re-embedding exist. Keep pluggable provider strategy. |
| MCP | In progress | Capability Broker and governed MCP provider added in hierarchical runtime work. Informatica MCP remains a concrete provider target. |
| AI Security | Strong native foundation, incremental gap | Existing deterministic authorization, resource ACL, policy, evidence and security gates remain primary. Add model/input/output safety providers only where they provide measurable controls. |
| Observability | Implemented / being strengthened | Durable telemetry, W3C trace context, OTLP exporter, Job Monitor and evidence drilldown exist. Workflow DAG projection is now being integrated. |
| Memory | Implemented | Governed working and verified episodic memory exist. Do not introduce an external memory framework without a storage/latency/quality requirement. |
| AI Agent SDKs | Implemented natively | Native agent runtime is the system of execution. External SDKs may be adapters, never an alternate authority plane. |
| Automation | Implemented domain-specifically | Runtime workflows, governance automation and durable jobs cover core needs. n8n/Zapier/Make can be future edge connectors behind governed capabilities, not trusted execution authorities. |
| Vector database | Implemented through governed semantic storage/search | Current semantic persistence and search should remain default. Add a dedicated vector service only when scale benchmarks justify it. |

## Implementation rules

1. One control plane: DataNexus policy and authorization remain authoritative.
2. One execution graph: hierarchical workflow Runtime v2 owns task state and dependencies.
3. External frameworks are providers/adapters, never parallel orchestrators.
4. MCP calls pass through the Capability Broker and carry correlation identity.
5. Retrieval results retain authority, temporal and provenance metadata.
6. Memory eligible for learning requires verified evidence and excludes synthetic bootstrap cases.
7. Telemetry excludes prompts, completions and hidden reasoning payloads.
8. Model, embedding, retrieval, memory and telemetry integrations remain provider-neutral.
9. New dependencies require a measured capability gap, security review, cost review and failure-mode contract.
10. Vendor additions must fail closed and must not widen persona, project, dataset or resource authority.

## Prioritized additions from the reference

P0: finish governed MCP integration, workflow DAG observability, authorization-at-execution and typed task I/O validation.

P1: introduce a provider-neutral AI safety boundary for input/output policy checks and prompt-injection classification, integrated into Capability Broker admission.

P1: expose the existing model/retrieval/memory/telemetry provider health and active provider identity in Command Center observability.

P2: add optional external automation adapters only for outbound workflow integration use cases.

P3: benchmark dedicated vector databases only after current Postgres/Supabase semantic search reaches an evidenced scale or latency threshold.

## Explicit non-goals

Do not install LangGraph, CrewAI, AutoGen, LlamaIndex, LangChain, Redis, Pinecone, Langfuse, Promptfoo, n8n or similar products merely because they appear in a reference stack. They become candidates only when an accepted DataNexus requirement cannot be met cleanly by the current governed abstractions.
