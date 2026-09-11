# Native DataNexus Agent Platform — End-to-End Automation Target

**Date:** 2026-09-11  
**Status:** Accepted implementation direction / consolidated architecture summary  
**Applies to:** Native DataNexus agents, specialist agents, orchestration, recovery, governed autonomous execution, runtime state, tool execution, learning and evaluation  
**Related records:** ADR-007 agent classification framework; ADR-008 native-first agent runtime; native runtime state capability review; native runtime contract pinning

## 1. Decision

DataNexus will build the agent platform **natively end-to-end first** and establish a real production baseline before selectively replacing, augmenting or benchmarking individual components with external agent frameworks.

The target operating model is **minimal human intervention** and **fully automated execution by default where policy, risk, reversibility and evidence permit**.

Human intervention remains a deliberate control for actions that are high-risk, irreversible, externally privileged, legally/policy constrained, or explicitly approval-gated. The goal is not zero governance; the goal is to remove unnecessary manual work while keeping deterministic policy authority outside probabilistic reasoning.

The governing rule is:

> **Build native, compare continuously, challenge aggressively, preserve governance, and benchmark externally only after DataNexus has an end-to-end native baseline.**

## 2. Native-first does not mean framework-blind

Every significant native capability must be challenged against current best-in-class agent runtimes, protocols and standards.

Each capability review must answer:

1. What does DataNexus have now?
2. What do leading runtimes/standards support now?
3. Is DataNexus at advantage, parity, partial coverage or a real gap?
4. Is the gap required for the current target?
5. Should DataNexus keep, build, borrow a design pattern, expose an extension point, benchmark later or reject the feature?

Required capability labels:

- `ADVANTAGE`
- `PARITY`
- `PARTIAL`
- `GAP_REQUIRED`
- `GAP_DEFERRED`
- `NOT_APPLICABLE`

Required dispositions:

- `KEEP`
- `BUILD_NOW`
- `BUILD_LATER`
- `BORROW_PATTERN`
- `EXTENSION_POINT`
- `BENCHMARK_LATER`
- `REJECT`

This rule is also captured in repository-level `AGENTS.md` so future AI-assisted engineering work does not equate “native” with “good enough.”

## 3. External technologies evaluated as design references

The following were reviewed as current industry comparators:

| Technology | What it contributes | DataNexus decision now |
| --- | --- | --- |
| LangGraph | Durable graph execution, checkpoints, interrupts, state history, replay/fork, long-running reasoning | Reference + future benchmark; no runtime dependency yet |
| OpenAI Agents SDK | TypeScript agent loop, handoffs, agents-as-tools, guardrails, HITL, tracing | Reference + future benchmark; no runtime dependency yet |
| Microsoft Agent Framework | Deterministic/agent/HITL workflow composition, checkpoints, typed executors, orchestration patterns | Borrow design patterns; no core runtime adoption now |
| CrewAI | Crew/Flow separation, hierarchical specialists, persisted flow state, HITL | Borrow collaboration patterns; no core runtime adoption now |
| LlamaIndex | Retrieval/query tools, document intelligence, agent workflows | Future knowledge/retrieval benchmark |
| Google ADK | Agent lifecycle, evaluation, A2A/MCP integration and deployment patterns | Reference benchmark |
| MCP | Standard agent-to-tool/resource protocol | Strategic future interoperability layer; DataNexus policy remains above it |
| A2A | Standard agent-to-agent interoperability | Design-compatible future boundary for distributed agents |
| OpenTelemetry GenAI | Standard agent/model/tool telemetry semantics | Align progressively while preserving DataNexus privacy rules |

Primary current references include:

- https://docs.langchain.com/oss/javascript/langgraph/overview
- https://docs.langchain.com/oss/javascript/langgraph/persistence
- https://docs.langchain.com/oss/javascript/langgraph/interrupts
- https://openai.github.io/openai-agents-js/
- https://learn.microsoft.com/en-us/agent-framework/
- https://docs.crewai.com/
- https://docs.llamaindex.ai/
- https://google.github.io/adk-docs/
- https://modelcontextprotocol.io/specification/2026-07-28
- https://a2a-protocol.org/latest/
- https://github.com/open-telemetry/semantic-conventions-genai

The strategic conclusion from this comparison is **standards first, framework second**. DataNexus should preserve its policy/governance/control plane, adopt interoperability standards where useful, and selectively borrow or benchmark runtime primitives after the native baseline exists.

## 4. Non-delegable DataNexus authority

No external framework, model, specialist agent or orchestration layer may become the source of authority for:

- identity and authentication;
- organization/project scope;
- authorization and RLS;
- mutation permission;
- risk classification;
- user consent and approval requirements;
- policy enforcement;
- canonical evidence;
- durable business-job truth;
- audit history;
- idempotency and retry ceilings;
- rollback/compensation governance;
- recovery validation;
- model-routing authority;
- evaluation authority;
- learning/promotion authority;
- privacy and secret-handling rules.

Models and agents may reason, plan, recommend, rank alternatives and coordinate specialists. DataNexus deterministic controls authorize and execute.

## 5. Agent classification remains multi-dimensional

All agents must continue to use the accepted multi-dimensional classification framework rather than a single `agent_type` label.

Important distinctions retained from ADR-007:

- a business objective does not make an agent `GOAL_BASED` unless the runtime actually plans/evaluates future states;
- persisted history does not make an agent `LEARNING` unless validated outcomes change future policy/decisions;
- `orchestrator` is an operational role, not a decision architecture;
- `multi-agent` is topology, not decision architecture;
- `self-healing` requires post-remediation observation and validation of restored objectives;
- components may truthfully be governed controllers/workflows before they mature into autonomous agents.

The accepted classification dimensions include decision architecture, reasoning architecture, operational role, control pattern, autonomy, human governance, state, trigger, topology, coordination, knowledge, tooling, learning/adaptation, determinism, explainability, risk/governance, observability and recovery/validation.

## 6. Execution Recovery classification

The current Execution Recovery capability was reclassified conservatively as:

- **Decision architecture:** `MODEL_BASED_REFLEX`
- **Operational role:** `RECOVERY_ORCHESTRATOR`
- **Reasoning:** reactive today; target hybrid reactive-deliberative
- **Control:** closed-loop recovery controller; target richer governed self-healing
- **State:** stateful
- **Trigger:** event-driven
- **Autonomy:** bounded/governed
- **Human governance:** HITL for elevated-risk recovery

It is **not yet formally goal-based, utility-based, learning or multi-agent** because those require implemented planning/search, utility comparison, outcome-driven policy adaptation and real autonomous specialist delegation respectively.

## 7. Native runtime capabilities implemented so far

### 7.1 ADR-008 and repository operating rule

PR #259 established native-first continuous capability parity and added repository `AGENTS.md` so every significant native capability must be challenged against current best-in-class systems before being considered complete.

Merged to `main` at:

- `d814f1f6f6c9d248448635027fdf3c663cbd23b2`

### 7.2 Native checkpoint / interrupt / replay foundation

PR #260 added the shared native runtime-state foundation:

- append-only versioned checkpoints;
- checkpoint integrity hashing;
- state history and parent lineage;
- concurrency-safe checkpoint ordering;
- long-lived `WAITING` state;
- governed HITL approve/reject;
- exact action fingerprinting;
- separation between approval and execution;
- resume semantics;
- controlled replay/fork lineage;
- idempotency collision detection;
- fail-closed state transitions.

Merged to `main` at:

- `973e4120c04e6d1b3b9483003ab7fc8a0a13799c`

Production Supabase migration:

- `20260911130652 native_agent_runtime_state`

### 7.3 Runtime definition pinning and tool guardrails

PR #262 added:

- immutable private per-run runtime manifests;
- exact agent-definition/version pinning;
- application runtime/deployment version pinning;
- immutable tool-contract snapshots;
- SHA-256 contract/manifests;
- current administrative kill switches;
- typed tool input/output schemas;
- fail-closed deterministic contract validation;
- pre-tool admission guardrails;
- post-tool output validation;
- exact executor binding;
- side-effect and idempotency restrictions;
- exact approval-to-input binding;
- hash-only invocation evidence;
- replay preserving the source runtime manifest rather than re-resolving current definitions.

The profiling executor is the first real production tool path migrated to these guardrails.

Merged to `main` at:

- `edf99a8db32fc93a9813a64a203005a8a26f594a`

Production Supabase migration:

- `20260911135231 native_runtime_contract_pinning`

Exact production Vercel deployment for the merge:

- `dpl_F6e28xjaB8vBPd8M3auTcsUPoYAw`

Production verification confirmed zero fabricated runtime manifests/invocations at verification time.

## 8. Current capability position

| Capability | Current status | Direction |
| --- | --- | --- |
| Durable business-job truth | `ADVANTAGE` | Keep in `orchestration.durable_jobs` |
| Step-level resumability | `PARITY` | Keep |
| General runtime checkpoints | `PARITY` foundation | Expand adoption |
| Checkpoint integrity/privacy | `ADVANTAGE` | Keep |
| Long-lived pause/resume | `PARITY` foundation | Expand adoption |
| Exact approval binding | `ADVANTAGE` | Keep |
| Approval/execution separation | `ADVANTAGE` | Keep |
| Runtime definition pinning | `PARITY / ADVANTAGE` | Keep |
| Tool contract pinning | `PARITY` | Keep |
| Input/output guardrails | `PARITY` | Keep |
| Executor authorization | `ADVANTAGE` | Keep |
| Hash-only invocation evidence | `ADVANTAGE` | Keep |
| Replay lineage | `PARTIAL` | Certify per-tool replay safety |
| Every-agent runtime adoption | `GAP_REQUIRED` | Build |
| Cross-deployment compatible resume | `GAP_REQUIRED` | Build certification mechanism |
| Bounded planning | `GAP_REQUIRED` | Build next |
| Deterministic plan validation | `GAP_REQUIRED` | Build next |
| Native supervisor/orchestrator | `GAP_REQUIRED` | Build next |
| Automatic risk-tier execution policy | `GAP_REQUIRED` | Build next |
| Specialist handoff/context filtering | `GAP_REQUIRED` | Build |
| Closed-loop autonomous recovery | `PARTIAL` | Expand Recovery V2 |
| Rollback/compensation contracts | `GAP_REQUIRED` | Build |
| Trajectory evaluation | `GAP_REQUIRED` | Build |
| Governed outcome learning | `PARTIAL` platform capability | Integrate into agent loop |
| Pending approval / exception UX | `GAP_REQUIRED` | Build after execution foundation |
| Multi-agent supervisor topology | `GAP_REQUIRED`, later | Build after single-supervisor loop is proven |

## 9. Target fully automated control loop

The target runtime is:

```text
Goal / Event / Schedule
        ↓
Native Supervisor
        ↓
Generate bounded plan
        ↓
Deterministic plan validation
        ↓
Policy + risk classification
        ↓
Safe / read-only / certified idempotent?
   ├── Yes → execute automatically
   └── No  → approval only when policy requires it
        ↓
Execute pinned governed tools
        ↓
Observe result
        ↓
Validate expected outcome
        ↓
Success?
   ├── Yes → persist evidence → evaluate trajectory → learn from verified outcome → close
   └── No  → diagnose → bounded retry / alternative plan / rollback / escalation
```

This is the definition of the desired **minimal-human-intervention DataNexus operating model**.

## 10. Human-intervention policy

The long-term objective is not “ask a human for every mutation.” Instead:

### Automatically executable when policy allows

Examples include:

- read-only investigation;
- evidence gathering;
- retrieval/search;
- profiling and diagnostics;
- deterministic validation;
- certified idempotent retries;
- reversible low-risk remediation;
- low-risk specialist handoffs;
- bounded autonomous execution under explicit policy and project scope.

### Human intervention remains appropriate when required

Examples include:

- irreversible destructive actions;
- production schema/pipeline changes without pre-certified reversible policy;
- privilege/credential/security-boundary changes;
- policy exceptions/waivers;
- high-impact remediation outside pre-authorized bounds;
- actions where evidence is insufficient or risk classification is uncertain;
- legal/regulatory controls that require human accountability.

The human should operate as an **exception/approval boundary**, not as the default workflow engine.

## 11. Highest-priority pending work for end-to-end autonomous execution

The implementation order is now:

### P0 — Native Supervisor + bounded planning + deterministic plan validation

Build the component that turns a goal/event into a bounded, typed, reviewable plan using registered agents/tools. It must validate topology, input/output compatibility, authority, project scope, risk, budgets, maximum steps and required approval gates before execution.

### P0 — Automatic execution policy

Policy must classify each planned step into at least:

- automatic read-only;
- automatic certified idempotent/reversible;
- governed bounded autonomy;
- explicit approval required;
- prohibited.

Safe steps should not pause for humans.

### P0/P1 — Closed-loop execution and recovery

Complete the loop:

- execute;
- observe;
- verify;
- retry only when safely classified;
- attempt an approved alternative plan when bounded;
- rollback/compensate when certified;
- escalate only when autonomous resolution is unsafe or exhausted.

### P1 — Runtime adoption across all active agents

Migrate governance specialists, recovery and other executors to the shared runtime manifest/tool guardrail/checkpoint primitives. No “fully automated platform” claim should be made while only profiling uses the full runtime boundary.

### P1 — Specialist handoffs and supervisor/worker coordination

Add typed handoff contracts, context minimization/filtering, authority narrowing and child-run lineage.

### P1 — Replay/idempotency/compensation certification

Each side-effecting tool must declare and prove whether it is:

- read-only;
- idempotent;
- replay-safe;
- reversible;
- compensatable;
- approval-required.

Automatic replay is prohibited until certified.

### P1 — Cross-deployment compatible resume

Current behavior correctly fails closed if runtime version changes. Add explicit compatibility certification so long-lived paused runs may resume on a newer deployment only when the old state/contract is proven compatible.

### P1/P2 — Trajectory evaluation and governed learning

Evaluate complete runs rather than only isolated model outputs. Use verified outcomes to improve routing, planning and policy choices without allowing prior AI output to become authority by repetition.

### P2 — Exception and approval workspace

Provide a concise operator surface for genuinely blocked/high-risk actions: what happened, why automation stopped, proposed change, evidence, impact, rollback/compensation path, and approve/reject controls.

## 12. Performance hardening item

Supabase performance advisors identified runtime-specific foreign-key indexes that should be added as a small hardening slice. These are useful but **not the main blocker to end-to-end automation**. They should be completed opportunistically without delaying the supervisor/planning/control-loop work.

## 13. External framework evaluation timing

Do not integrate an external orchestration framework simply to obtain feature parity before the native system is complete.

After the native end-to-end baseline is operational, run controlled same-workload benchmarks, especially:

- Native DataNexus vs LangGraph vs OpenAI Agents SDK for complex recovery/planning;
- Native retrieval vs LlamaIndex for governance knowledge;
- DataNexus tool APIs vs MCP for interoperability;
- internal/distributed agent handoffs vs A2A where cross-process agents become necessary.

Use the same governance plane, workload, evidence and acceptance criteria. Measure reliability, recovery, duplicate-side-effect prevention, audit completeness, latency, cost, model calls, developer complexity and operations burden.

Any external component that weakens DataNexus governance is disqualified regardless of aggregate performance.

## 14. End-to-end completion criteria

The native agent platform should not be called fully end-to-end autonomous until all of the following are demonstrated with real or controlled evidence:

1. event/goal/schedule can start an autonomous run without manual orchestration;
2. supervisor creates a bounded plan;
3. plan is deterministically validated before execution;
4. safe steps execute automatically according to policy;
5. tool inputs/outputs are contract validated;
6. agent/runtime/tool contracts are pinned;
7. state is checkpointed and resumable;
8. specialist handoffs preserve least privilege and filtered context;
9. failures trigger bounded diagnosis/retry/alternative/rollback logic;
10. successful remediation is observed and validated;
11. duplicate side effects are prevented;
12. cross-deployment resume is explicitly compatible or fails closed;
13. full trajectory is auditable and evaluable;
14. verified outcomes can feed governed learning;
15. humans are contacted only where policy/risk requires them;
16. no success, evidence, lineage, remediation or learning outcome is fabricated;
17. canonical job/evidence/audit state remains DataNexus-owned.

## 15. Immediate next milestone

The next major architecture milestone is therefore:

> **Native Supervisor + bounded planning + deterministic plan validation + automatic risk-tier execution policy.**

This is the missing bridge between the strong runtime primitives already implemented and the desired minimal-human-intervention autonomous operating model.
