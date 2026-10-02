# Major Discussion: External Agent Tooling and Harness Strategy

Date: 2026-10-02
Decision state: Proposed direction

## Question

Which external agent-engineering projects should DataNexus adopt, borrow from, benchmark, or reject while preserving the native-first runtime strategy?

## Context

DataNexus already defines a native-first architecture in AGENTS.md and requires comparisons against best-in-class systems. External frameworks may assist with reasoning, planning, retrieval, testing, documentation, or review, but DataNexus retains control-plane authority.

## Candidates

### Browser Use
Repository: https://github.com/browser-use/browser-use

Potential value: browser-driven UI acceptance, persona journeys, visual verification, browser-only integrations.

Primary risks: prompt injection from pages, credential/session exposure, nondeterministic execution, high context/token consumption.

Decision: EXTENSION_POINT. Keep outside the core runtime. Run sandboxed and least-privileged.

### Agent memory
Representative candidates include lightweight Claude memory skills and MCP-backed memory services.

Potential value: continuity for very large multi-session projects.

Primary risks: persistent poisoning, stale context, retrieval tax, duplication of repository-native knowledge and DataNexus learning.

Decision: GAP_DEFERRED. Define measurable need before adding another memory system.

### Scientific Agent Skills
Repository: https://github.com/K-Dense-AI/scientific-agent-skills

Potential value: specialist scientific/research workflows.

Decision: NOT_APPLICABLE to the default DataNexus runtime. Individual skills may be evaluated if a concrete product requirement appears.

### Diagram Design
Repository: https://github.com/cathrynlavery/diagram-design

Potential value: architecture, lineage, governance, execution, user-journey, and topology documentation.

Decision: EXTENSION_POINT. Low-authority integration with generated artifacts treated as documentation rather than operational truth.

### Claude Security
Official source: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security

Potential value: defensive repository/change review and patch suggestions.

Decision: EXTENSION_POINT / benchmark. Prefer official provenance. Keep existing DataNexus release/security gates authoritative.

Important distinction: community repositories using "Anthropic cybersecurity skills" naming are not automatically Anthropic-authored and require independent provenance and security review.

### Awesome Harness Engineering
Repository: https://github.com/harness-engineer/awesome-harness-engineering

Potential value: curated patterns for context engineering, permissions, evaluations, memory, orchestration, reliability, and safe autonomy.

Decision: BORROW_PATTERN. Use as a research/reference input, not a runtime dependency.

### OpenViking
Repository: https://github.com/volcengine/OpenViking

Potential value: hierarchical context/resource/memory organization and on-demand retrieval.

Primary risks: new service operational burden, persistence/poisoning boundary, tenant isolation, deletion/retention complexity, additional model/API dependencies.

Decision: BENCHMARK_LATER. Compare against DataNexus-native context and learning architecture before any adoption.

## Architectural decision

The optimized strategy is selective integration:

1. Borrow design patterns without importing runtime dependencies where possible.
2. Add security and browser capabilities through replaceable adapters.
3. Keep documentation tooling outside authoritative execution.
4. Require evidence before adding persistent memory infrastructure.
5. Benchmark OpenViking specifically for hierarchical context efficiency, not as an automatic replacement for DataNexus memory/learning.
6. Preserve DataNexus authorization, evidence, audit, approval, recovery, and learning authority in all cases.

## Threat model additions

Treat four new channels as untrusted:
1. web/page instructions consumed by browser agents;
2. third-party skill/plugin instructions;
3. persistent memory/context entries;
4. generated security fixes and documentation artifacts.

Controls should include provenance, revision pinning, input/output validation, least privilege, network/domain restrictions, secret isolation, audit traces, fail-closed policy enforcement, and kill switches.

## Expected benefit

This approach captures the strongest external ideas while avoiding a second agent control plane. It minimizes permanent token/context overhead, limits supply-chain exposure, and keeps integrations replaceable.

## Revisit triggers

Revisit deferred adoption when:
- repository/context files become materially too large or retrieval quality declines;
- repeated multi-session continuity failures are measured;
- browser-only validation becomes a release bottleneck;
- context token cost crosses an agreed threshold;
- OpenViking demonstrates material retrieval/cost advantage under DataNexus tenant, provenance, retention, and poisoning tests;
- a scientific workflow becomes an explicit product requirement.

## Related repository policy

This decision must be read with AGENTS.md and the native-first Agent Runtime ADRs. Runtime evidence overrides documentation when they conflict.
