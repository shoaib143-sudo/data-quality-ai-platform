# Major Discussion — Native DataNexus Agent Platform, Framework Evaluation, Native-First Decision and End-to-End Automation Target

**Date:** 2026-09-11  
**Status:** Accepted discussion summary and current continuation point  
**Purpose:** Consolidate the full discussion that led from agent classification and external-framework evaluation to the current native-first, minimal-human-intervention execution strategy.

## Executive summary

The discussion converged on a clear direction:

> **Build the DataNexus agent platform natively end-to-end first, continuously challenge it against the best current industry capabilities, and only after a working native production baseline exists should individual framework components be benchmarked, borrowed, integrated or replaced.**

The desired product behavior is now explicit:

> **Minimal human intervention. Fully automated execution by default where DataNexus policy, risk, reversibility, evidence and authorization permit it. Humans should be the exception boundary, not the workflow engine.**

This record captures how that decision was reached, what has already been implemented, what remains incomplete, and the agreed next milestone.

## 1. Starting point: agent classification needed to become rigorous

The first discussion focused on how DataNexus should describe its current and future agents without overclaiming maturity.

A multi-dimensional framework was accepted because labels such as “orchestrator,” “goal-based,” “learning” or “multi-agent” can otherwise hide important implementation gaps.

The framework requires classification across decision architecture, reasoning, operational role, control pattern, autonomy, human governance, state, trigger model, topology, coordination, knowledge, tooling, learning/adaptation, determinism, explainability, risk/governance, environment observability and recovery/validation.

Important rules accepted during the discussion:

- having a business goal is not enough to call an agent goal-based;
- persisting historical runs is not enough to call an agent learning;
- orchestrator is a role, not a decision architecture;
- multi-agent is topology, not intelligence architecture;
- self-healing requires validation after remediation;
- a component should be called a governed controller/workflow when that is more truthful than calling it an autonomous agent.

This became the durable agent classification standard in:

- `Architecture/2026-09-11-ADR-007-agent-classification-framework.md`
- `Major discussion/2026-09-11-agent-classification-framework-and-portfolio-review.md`

## 2. Execution Recovery Agent was deliberately reclassified

The discussion corrected an earlier tendency to describe the Recovery Agent too aggressively.

Current classification:

- primary decision architecture: `MODEL_BASED_REFLEX`;
- role: `RECOVERY_ORCHESTRATOR`;
- stateful and event-driven;
- reactive today, target hybrid reactive-deliberative;
- bounded/governed autonomy;
- human-in-the-loop for elevated recovery;
- closed-loop recovery controller today, target richer governed self-healing.

It is not yet formally:

- `GOAL_BASED` because there is no true plan/search over future alternatives;
- `UTILITY_BASED` because alternatives are not scored through an explicit utility function;
- `LEARNING` because verified outcomes do not yet change future decisions/policy;
- true `MULTI_AGENT` because no autonomous specialist-agent delegation exists yet.

This conservative classification became important later when deciding which native runtime capabilities were genuinely missing.

## 3. External frameworks and standards were evaluated

The discussion then asked whether DataNexus should use or learn from prebuilt agent technologies such as LangGraph, CrewAI, MCP, Microsoft Semantic Kernel/Agent Framework and LlamaIndex.

The framing was corrected early:

> Most of these are frameworks, SDKs or protocols, not prebuilt agents. DataNexus should compare primitives/capabilities, not simply ask which framework “wins.”

The evaluation was expanded to include:

- LangGraph;
- OpenAI Agents SDK;
- Microsoft Agent Framework;
- CrewAI;
- LlamaIndex;
- Google ADK;
- MCP;
- A2A;
- OpenTelemetry GenAI conventions.

The strongest architectural conclusion was:

> **Standards first, framework second.**

### 3.1 MCP

MCP was recognized as strategically valuable for future standardized agent-to-tool/resource access, but it must sit below DataNexus authorization and policy.

DataNexus remains responsible for identity, project scope, RLS, risk, consent, least privilege and audit.

MCP is therefore a future interoperability boundary, not a replacement for DataNexus governance.

### 3.2 A2A

A2A moved from a “later” idea to a first-class interoperability standard to design for.

The useful division is:

- MCP: agent ↔ tool/resource;
- A2A: agent ↔ agent.

This future-proofs distributed specialist agents without forcing all agents to use the same internal framework.

### 3.3 LangGraph

LangGraph remained the strongest runtime benchmark for:

- durable reasoning execution;
- checkpoints;
- interrupts;
- long-running pause/resume;
- state history;
- replay/forking;
- cyclic deliberative workflows.

The especially relevant DataNexus use case is a future Recovery Agent that can diagnose, gather evidence, plan alternatives, request approval, execute, validate, rollback and resume after process failure.

However, the discussion explicitly rejected replacing `orchestration.durable_jobs` with framework state. Business execution truth must remain DataNexus-owned.

### 3.4 OpenAI Agents SDK

The TypeScript SDK was added as an important comparator because DataNexus itself is TypeScript-first.

Useful capabilities to benchmark later include:

- agent loops;
- tool guardrails;
- handoffs;
- context filtering;
- agents-as-tools;
- HITL;
- tracing.

It was not selected as a production dependency at this stage.

### 3.5 Microsoft Agent Framework

The current Microsoft comparator shifted from Semantic Kernel to Microsoft Agent Framework for new architecture evaluation.

The most useful pattern is the explicit separation of:

- deterministic execution when code should decide;
- agent reasoning when the model should decide;
- HITL gates when a human should decide.

This strongly validates the DataNexus architecture where probabilistic reasoning never becomes mutation authority.

### 3.6 CrewAI

CrewAI was re-evaluated more positively than initially expected. Its Crews/Flows distinction, hierarchical specialists, persistence and HITL patterns are useful design references.

However, its Python-first runtime and role/backstory abstractions are not a reason to replace DataNexus's TypeScript-first policy/control plane.

### 3.7 LlamaIndex

LlamaIndex was narrowed to a likely future retrieval/document-intelligence benchmark rather than a main DataNexus orchestration runtime.

Potential evaluation areas include governance documents, policy corpora, regulatory text, query-engine tools and structured retrieval.

### 3.8 Google ADK and OpenTelemetry GenAI

Google ADK was added as a lifecycle/evaluation/interoperability reference.

OpenTelemetry GenAI conventions were identified as the direction for telemetry naming/semantics, while DataNexus retains its stricter privacy rule: raw prompts, completions, secrets and hidden reasoning should not automatically leave the platform.

## 4. The comparison changed from “framework selection” to “capability harvesting”

The discussion established a reusable decision model:

- `KEEP` — DataNexus implementation is already equal/better;
- `BORROW` — copy the design idea without taking the dependency;
- `INTEGRATE` — use the standard/library directly when justified;
- `PILOT` — high potential but needs evidence;
- `REJECT` — creates weaker governance, duplication or unnecessary complexity.

This avoided a rewrite mentality.

The intended question is no longer:

> “Should DataNexus be rewritten in LangGraph/CrewAI/etc.?”

It is:

> “Which concrete capability is stronger elsewhere, what gap do we actually have, and what is the least risky way to close it?”

## 5. A true end-to-end evaluation was distinguished from architecture research

The earlier framework review was explicitly not called a full empirical end-to-end evaluation.

A true E2E comparison would still require same-workload experiments with failure injection, HITL, security, replay, state consistency, audit completeness, performance, cost, operational burden and maintainability.

A proposed future benchmark workload is the Execution Recovery Agent, comparing at least:

- Native DataNexus;
- Native DataNexus + LangGraph reasoning runtime;
- Native DataNexus + OpenAI Agents SDK reasoning runtime.

All implementations would share the same DataNexus authorization, policy, evidence, durable-job and audit boundaries.

That benchmark is intentionally deferred until the native platform has a complete baseline.

## 6. Native-first decision

The user then made the strategic choice:

> Build everything Native DataNexus first. Once the native system is complete end-to-end, then begin replacing/evaluating individual parts and measuring the performance or architectural change.

This was accepted as the core implementation direction.

However, the user added an equally important requirement:

> Native DataNexus must be questioned at every step against advanced/best-in-class features and capabilities.

That became a standing architecture and engineering rule.

## 7. Continuous capability-parity rule

For every major native capability, DataNexus must answer:

- what exists today;
- what leading systems support;
- what is missing;
- whether the missing capability is required now;
- whether to build now, build later, borrow the pattern, expose an extension point, benchmark later or reject it.

Status labels:

- `ADVANTAGE`
- `PARITY`
- `PARTIAL`
- `GAP_REQUIRED`
- `GAP_DEFERRED`
- `NOT_APPLICABLE`

Action labels:

- `KEEP`
- `BUILD_NOW`
- `BUILD_LATER`
- `BORROW_PATTERN`
- `EXTENSION_POINT`
- `BENCHMARK_LATER`
- `REJECT`

This rule was encoded in repository `AGENTS.md` and documented by ADR-008.

PR #259 merged this direction to `main` at:

- `d814f1f6f6c9d248448635027fdf3c663cbd23b2`

## 8. Native runtime implementation completed during the discussion

The conversation did not stop at architecture. Two major runtime slices were implemented and production-verified.

### 8.1 Native checkpoint / pause / resume / replay foundation

PR #260 implemented:

- generalized append-only checkpoints;
- canonical checkpoint SHA-256 integrity;
- checkpoint state privacy rules;
- concurrency-safe checkpoint sequencing;
- long-lived pause state;
- HITL decisions;
- exact action fingerprinting;
- approval/execution separation;
- resume semantics;
- immutable state history;
- controlled replay/fork lineage;
- idempotency collision checks;
- fail-closed transitions.

It merged at:

- `973e4120c04e6d1b3b9483003ab7fc8a0a13799c`

Live Supabase migration:

- `20260911130652 native_agent_runtime_state`

### 8.2 Runtime contract pinning and tool guardrails

The next capability challenge found that DataNexus already had versioned tool definitions and schemas. The real gap was enforcement and immutable pinning, not “typed tools” as a new registry.

PR #262 therefore added:

- immutable per-run runtime manifests;
- exact agent definition/version snapshot;
- runtime/deployment version pinning;
- immutable tool contracts;
- contract hashes;
- current administrative kill switches;
- deterministic input validation;
- output validation;
- executor identity enforcement;
- declared-property-only tool input;
- side-effect restrictions;
- idempotency enforcement;
- exact approval-to-input binding;
- hash-only invocation evidence;
- replay that copies the original manifest instead of silently using today's definitions.

A migration-order defect was caught by clean-database reconstruction before merge. The migration was moved after the runtime-state migration and the verifier updated, proving the value of exact-head CI and clean reconstruction.

PR #262 merged at:

- `edf99a8db32fc93a9813a64a203005a8a26f594a`

Live Supabase migration:

- `20260911135231 native_runtime_contract_pinning`

Exact production Vercel deployment:

- `dpl_F6e28xjaB8vBPd8M3auTcsUPoYAw`

Production verification confirmed RLS, service-role mutation boundaries, empty function search paths, append-only/transition guards and no fabricated runtime evidence.

## 9. What DataNexus already does strongly

The discussion repeatedly reinforced that external frameworks should not displace the areas where DataNexus is already deliberately enterprise-governed.

Current strengths include:

- canonical evidence truth;
- project-scoped authorization;
- Supabase RLS;
- governed mutation boundaries;
- risk-tier consent;
- durable business-job semantics;
- failure preservation;
- auditable artifacts;
- model routing/evaluation boundaries;
- deterministic policy authority;
- verified-memory/learning boundaries;
- recovery evidence and bounded retry controls;
- pinned runtime/tool contracts;
- exact approval binding;
- privacy-aware telemetry and hash-only tool evidence.

These are considered product architecture, not framework plumbing.

## 10. Current automation gap

When the user asked specifically what remained from an **end-to-end automated execution** perspective, the answer became much sharper.

The platform now has many runtime primitives, but it does **not yet have the complete autonomous control loop**.

The major missing capabilities are:

- native supervisor/orchestrator;
- bounded planning;
- deterministic plan validation;
- automatic risk-tier execution;
- broad adoption of the shared runtime across all active agents;
- closed-loop execution/verification/recovery;
- richer Recovery V2 behavior;
- specialist handoffs with context filtering;
- replay/idempotency certification per tool;
- rollback/compensation contracts;
- cross-deployment compatible resume;
- trajectory evaluation;
- governed learning from verified outcomes;
- an exception/approval workspace for the small set of operations that really need a person.

The important change in priority was:

> Do not let minor hardening work such as FK-index cleanup delay the autonomy control-loop work.

Performance hardening should continue, but it is not the main blocker to autonomous operation.

## 11. Desired minimal-human-intervention behavior

The agreed runtime behavior is:

```text
Goal / Event / Schedule
        ↓
Native Supervisor
        ↓
Generate bounded plan
        ↓
Validate plan deterministically
        ↓
Classify risk and authority
        ↓
Safe?
   ├── yes → execute automatically
   └── no  → request approval only when policy requires it
        ↓
Execute pinned governed tool
        ↓
Observe result
        ↓
Validate outcome
        ↓
Failure?
   ├── no  → persist evidence → evaluate → learn → close
   └── yes → diagnose → retry / alternate plan / rollback / escalate
```

This is the working definition of **fully automated run** for DataNexus.

## 12. Human intervention should be the exception, not the default

The discussion explicitly rejected the idea that every mutation must permanently require manual approval.

The target is risk-tiered autonomy.

Safe/read-only/certified-idempotent/reversible operations should run automatically when policy allows.

Human intervention remains appropriate when:

- the action is irreversible/destructive;
- credentials/privilege/security boundaries are affected;
- policy requires accountability or waiver;
- production schema/pipeline changes are outside a pre-authorized reversible boundary;
- evidence is insufficient;
- risk is uncertain;
- autonomous recovery has exhausted its bounded options.

The human becomes an **exception/approval boundary**.

## 13. Immediate priority now

The next major development milestone is:

> **Native Supervisor + bounded planning + deterministic plan validation + automatic risk-tier execution policy.**

This is now higher priority than framework experiments and higher priority than non-blocking runtime FK-index cleanup.

It is the missing bridge between:

- the strong native execution primitives already built; and
- the desired end-to-end autonomous DataNexus experience.

## 14. Subsequent execution sequence

After the supervisor/planner slice:

1. complete closed-loop autonomous execute → observe → validate → recover/rollback;
2. migrate all active agents to the shared runtime manifest/checkpoint/tool guardrail boundary;
3. add typed specialist handoffs, child-run lineage and least-privilege context filtering;
4. certify replay/idempotency/reversibility/compensation per side-effecting tool;
5. add explicit cross-deployment compatibility certification for paused runs;
6. add trajectory evaluation/regression testing;
7. integrate verified outcomes into governed learning;
8. build a concise approval/exception workspace;
9. only after native E2E baseline is stable, run controlled external-framework benchmarks.

## 15. Frameworks remain future benchmark candidates, not current dependencies

After the native baseline exists, the intended benchmark tracks are:

### Agent runtime

- Native DataNexus
- LangGraph
- OpenAI Agents SDK
- relevant Microsoft/CrewAI/ADK patterns as appropriate

### Knowledge/retrieval

- Native DataNexus semantic/retrieval
- LlamaIndex

### Interoperability

- current DataNexus tool APIs vs MCP
- current agent handoffs vs A2A where distributed agents are useful

Any external component must prove material value in reliability, operability, cost, developer complexity or capability without weakening DataNexus governance.

## 16. Non-negotiable truth boundaries

Throughout all future automation work:

- never fabricate success;
- never fabricate lineage, evidence, evaluation, recovery or learning outcomes;
- never silently weaken policy to make automation appear complete;
- never let probabilistic reasoning become authorization;
- never erase historical failure evidence;
- never let replay pretend external side effects were undone;
- keep durable job/evidence/audit authority in DataNexus;
- keep mutations scoped, least-privilege, auditable and reversible where possible.

## 17. Consolidated current position

DataNexus is no longer at the “basic agent” stage. It now has meaningful advanced native runtime foundations including checkpoints, HITL, replay lineage, immutable runtime/tool pinning, typed tool validation, approval binding and governed invocation evidence.

However, the platform should **not yet claim fully autonomous E2E execution**.

That claim becomes justified only when the supervisor/planner/policy loop can autonomously coordinate the existing primitives, recover from bounded failures, verify outcomes, learn only from validated results and involve humans only where policy or genuine risk requires them.

## 18. Related durable records

Architecture:

- `Architecture/2026-09-11-ADR-007-agent-classification-framework.md`
- `Architecture/2026-09-11-ADR-008-native-first-agent-runtime-and-continuous-capability-parity.md`
- `Architecture/2026-09-11-native-agent-runtime-state-capability-review.md`
- `Architecture/2026-09-11-native-runtime-contract-pinning.md`
- `Architecture/2026-09-11-native-agent-platform-e2e-automation-target.md`

Major Discussion:

- `Major discussion/2026-09-11-agent-classification-framework-and-portfolio-review.md`
- `Major discussion/2026-09-11-native-first-agent-runtime-and-capability-parity.md`
- `Major discussion/2026-09-11-native-agent-platform-e2e-automation-discussion-summary.md`

Repository rule:

- `AGENTS.md`

These files together are the durable source of truth for the current native-agent direction.
