# External Agent Tooling Adoption Plan

Date: 2026-10-02
Status: Proposed implementation baseline
Scope: DataNexus agent/runtime engineering support tooling

## Objective

Adopt useful patterns and narrowly scoped tools without weakening DataNexus-owned authority boundaries or adding permanent context/token cost without measurable benefit.

## Decision summary

| Capability | Candidate | Disposition | Priority |
| --- | --- | --- | --- |
| Harness engineering | harness-engineer/awesome-harness-engineering | BORROW_PATTERN | P0 |
| Defensive security review | anthropics/claude-plugins-official, claude-security | EXTENSION_POINT / benchmark | P0 |
| Diagram generation | cathrynlavery/diagram-design | EXTENSION_POINT | P1 |
| Browser automation | browser-use/browser-use | EXTENSION_POINT, isolated test only | P1 |
| Hierarchical context store | volcengine/OpenViking | BENCHMARK_LATER | P2 |
| Third-party agent memory | candidate memory skills/MCP services | GAP_DEFERRED | P3 |
| Scientific agent skills | K-Dense-AI/scientific-agent-skills | NOT_APPLICABLE by default | P3 |

## Non-negotiable boundaries

External tooling must not become authoritative for authentication, organization/project scope, RLS, authorization, agent/tool allowlists, governed mutation policy, risk tiers, approvals, canonical evidence, durable job truth, audit history, retry/idempotency, rollback/recovery, model routing, learning authority, secrets, or sensitive-data policy.

No external memory may silently become trusted learning. No browser agent receives important logged-in sessions by default. Browser-derived instructions are untrusted input. Third-party skills receive least privilege and are pinned/reviewed before use.

## Optimized implementation sequence

### Phase 0: supply-chain and policy gate

1. Maintain an allowlisted external-tool registry with repository, owner, pinned revision/version, license, purpose, permissions, network access, secrets access, persistence behavior, and review status.
2. Add provenance and dependency-review checks before enabling any tool.
3. Define capability-level kill switches and default-disabled production behavior.
4. Treat external page content, retrieved memory, skill instructions, and generated artifacts as untrusted until validated.

Exit: no candidate can execute merely because it is installed.

### Phase 1: harness patterns, no runtime dependency

Review Awesome Harness Engineering against the existing AGENTS.md challenge areas. Convert only useful gaps into DataNexus-native requirements and tests.

Focus: context delivery, permission envelopes, tool schemas, evaluation, memory lifecycle, observability, bounded autonomy, failure handling, cost controls.

Exit: capability matrix records KEEP, BUILD_NOW, BUILD_LATER, BORROW_PATTERN, EXTENSION_POINT, BENCHMARK_LATER, REJECT, or NOT_APPLICABLE.

### Phase 2: defensive security adapter

Evaluate the official Anthropic security plugin as an optional development/CI reviewer. Keep CodeQL and existing DataNexus security gates authoritative. Normalize findings into DataNexus evidence rather than accepting third-party verdicts as release authority.

Test: malicious repository text, prompt injection, unsafe patch proposal, secret exposure attempt, false positive handling, timeout/unavailability.

Exit: advisory findings are auditable and cannot bypass release governance.

### Phase 3: diagram generation

Introduce diagram generation for architecture, lineage, governance flows, execution topology, and Job Monitor documentation. Generated diagrams are documentation artifacts, never operational truth.

Test: deterministic source inputs, sanitization, large graph behavior, accessibility/text fallback, stale-diagram detection.

Exit: reproducible diagrams from governed source data or checked-in specifications.

### Phase 4: sandboxed browser verification

Use Browser Use only where browser interaction adds evidence: authenticated route/CTA testing, persona journeys, visual checks, and browser-only integration flows.

Controls: isolated environment, synthetic/test identities by default, least privilege, domain allowlist, no production secrets, bounded actions, download/upload restrictions, prompt-injection defenses, trace capture, explicit destructive-action denial.

Exit: browser evidence supplements deterministic API/unit/integration tests and never becomes the sole authorization or release signal.

### Phase 5: OpenViking benchmark

Do not adopt OpenViking as the primary DataNexus memory store initially. Build a benchmark adapter around representative context workloads.

Measure retrieval precision/recall, provenance retention, token reduction, latency, storage growth, tenant isolation, deletion/retention behavior, poisoning resistance, operational burden, and failure recovery.

Exit: adopt only if measurable advantage exceeds operational/security cost while DataNexus remains the authority.

### Phase 6: memory decision

Only introduce an additional memory service if repository-native context plus DataNexus existing memory/learning architecture fails defined thresholds. Separate working context, episodic memory, semantic knowledge, and validated learning. Promotion into validated learning requires DataNexus governance.

### Phase 7: assurance

Run unit, integration, negative/failure-path, adversarial, authorization, tenant-isolation, injection, provenance, recovery, and regression tests. Record exact revision evidence.

## Parallel workstreams

1. Governance and supply-chain registry.
2. Harness capability-gap assessment.
3. Security adapter and adversarial tests.
4. Diagram/documentation adapter.
5. Browser sandbox and UI verification.
6. OpenViking/context benchmark, deliberately decoupled from production adoption.

Workstreams 1-5 can proceed in parallel after Phase 0. OpenViking benchmarking may proceed independently but cannot alter production memory authority.

## Success measures

- zero new implicit authority paths;
- zero production secrets exposed to browser/memory tooling;
- external tools default to least privilege;
- measurable context/token savings before memory infrastructure adoption;
- security findings carry provenance and evidence;
- browser tests are reproducible and sandboxed;
- generated diagrams trace back to governed sources;
- all third-party dependencies are pinned, reviewable, replaceable, and disableable.

## Initial recommendation

Implement harness-pattern review and security integration first. Add diagram generation and isolated browser verification next. Benchmark OpenViking rather than adopting it. Defer generic agent-memory and scientific-skill collections until a demonstrated DataNexus requirement exists.
