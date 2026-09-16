# AI and Agentic AI Test Plan

## Test versus evaluation

Deterministic software behavior uses pass/fail tests. Probabilistic AI behavior uses repeatable evaluation datasets, scorers, thresholds, and safety gates. Together they form certification evidence.

## Evaluation families

- Task interpretation and intent fidelity
- Groundedness and factual correctness
- Evidence/citation support
- Tool selection and parameter correctness
- Structured-output validity
- Hallucination and nonexistent-resource handling
- Prompt injection from user, data, metadata, retrieval, tool output, memory, and agent messages
- Excessive agency and unauthorized tool use
- Cross-project/context leakage
- RAG relevance, poisoning, stale sources, deletion behavior
- Memory isolation, correction, and contamination
- Provider timeout, malformed response, fallback, and model change
- Planning loops, repeated calls, budget exhaustion, context truncation
- Conflicting specialist conclusions and human handoff
- Policy override and approval-bypass attempts

## Ground-truth requirement

Where deterministic truth exists, AI conclusions must be checked against it. Agent-reported success is never sufficient evidence. Database, storage, audit, and execution state must independently confirm consequential actions.

## Change-triggered recertification

Changes to model, system prompt, tool descriptions, retrieval strategy, embedding model, memory, orchestration, policy, or action permissions trigger the relevant AI evaluation subsets.
