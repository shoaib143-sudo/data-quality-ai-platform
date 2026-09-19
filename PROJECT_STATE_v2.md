# DataNexus AI — Project State v2

> Durable continuity checkpoint for the current production architecture. Repository state, Supabase migration history, deployed runtime evidence, and this document are the primary continuity sources. When documentation conflicts with runtime evidence, runtime evidence wins and documentation must be corrected.

## 1. Project identity

- **Repository:** `shoaib143-sudo/data-quality-ai-platform`
- **Default branch:** `main`
- **Production URL:** `https://data-quality-ai-platform.vercel.app`
- **Supabase project:** `tvjnavjxuehpesxcfvrx`
- **Vercel project:** `data-quality-ai-platform`
- **Current verified protected main head at this checkpoint:** `62ad03f95f0ef6737f9071a3a31c72e4f60aba2d`
- **Current protected-main change at that head:** `Complete hybrid R2 large-object execution path (#776)`
- **Production exact-SHA status:** not certified at this checkpoint. The canonical Vercel production URL returned `404` for `/api/build-info` on 2026-09-19 while that route exists on protected `main`; production must not be represented as source-converged until a deployment exposes matching build identity.
- **Branch protection:** live ruleset `Protect main certification` currently requires GitHub Actions contexts `build`, `analyze`, `dependency-audit`, and `repository-governance`; squash merge and linear history are enforced, with no bypass actors.

## 2. Current production architecture

The application is no longer at the original static Agents placeholder state.

### Agents workspace

`/agents` is authenticated and connected to live governed state. It currently supports:

- live `agent.agent_definitions` registry reads;
- live `agent.tool_definitions` display;
- authenticated project and dataset-version context;
- capability-aware execution eligibility;
- conversational access separated from execution authority;
- recent authorized agent-run history;
- links into individual agent and run details;
- server-side execution through trusted executor paths.

The current Agents workspace must continue to preserve project/resource authorization and must not rely on UI-only permission checks.

### Job Monitor

The Job Monitor is production-deployed and includes domain-oriented topology plus `/monitoring/domain/[projectId]` drilldown. The domain view is authenticated, governed by authorized persisted execution state, and explicitly distinguishes recorded evidence from missing evidence instead of inferring nonexistent data.

The current domain drilldown exposes governed feature status, recent executions, domain context, durable orchestration context, lineage/evidence summaries, and links to run details. PR #448 additionally aligned feature cells and neural links on a common radial frame and added a dedicated radial-topology CI contract.

## 3. Agent Policy v2 — implemented production baseline

Agent Policy v2 is implemented and post-implementation revalidated.

Frozen behavior:

- all 13 DataNexus personas may access the Agents workspace and Job Monitor for authorized conversational/read workflows;
- `agent.execute` is not required for Ask, Query, Explain, Investigate, or Recommend;
- execution authority remains separately permissioned;
- resource ACL uses **DENY precedence**;
- risk is server-authoritative;
- material production mutation requires **Business + Governance** approval;
- the same person cannot satisfy both approval axes for one request;
- Business approver is Data Owner/Data Steward within governed scope;
- Governance approver is separately scoped;
- delegation is individual/scoped and retains `on_behalf_of` provenance;
- approval/rejection comments are mandatory;
- SLA remains 7/5/3/1 business days;
- DataNexus, Email, and Teams are supported notification channels;
- cross-channel approval replay is blocked;
- execution fingerprint is immutable approval binding;
- executor/policy/identity/fingerprint/decision evidence is audited;
- Email/Teams fail closed when provider configuration is absent.

### Synthetic approval-scope rule

Only records explicitly marked `metadata.synthetic_bootstrap = true` are excluded by themselves. A domain remains real when supported by an actual dataset or non-synthetic CDE/KDE evidence.

Validated real approval scopes include:

- Finance / Customer
- Profiling Demo Project / Customer
- Profiling Demo Project / general
- Profiling Demo Project / PUB

The synthetic-only Enterprise bootstrap evidence must not create a false production approval obligation.

## 4. Approval authority and notification state

### Authority

Current production evidence established both Business and Governance coverage for the real governed scopes above, with satisfiable separation of duties.

### Delegation policy

Frozen for Runtime v2:

- delegator or Data Governance Admin may create/revoke/manage delegation;
- delegate may view delegated authority but may not alter it.

### External notifications

Frozen for Runtime v2:

- Email and Teams may carry a signed approval link;
- notifications also provide a clear **Open in DataNexus** path;
- DataNexus remains the authoritative decision system;
- external tokens remain request/recipient/axis/channel/expiry bound and server-side authority is revalidated.

## 5. Production validation checkpoint

The Agent Policy implementation was revalidated after later Job Monitor changes instead of relying on earlier evidence.

Validation included:

- Agent Policy v2 unit tests;
- independent adversarial audit;
- approval-hardening verification;
- same-person dual-axis rejection;
- mandatory comment enforcement;
- revoked delegation rejection;
- resource ACL/DENY precedence;
- unauthorized execute/retry/cancel behavior;
- replay protection;
- fingerprint invalidation;
- risk recomputation/fail-closed behavior;
- production dual-approval enforcement;
- synthetic-domain exclusion;
- clean database reconstruction;
- Navigation Integrity;
- Persona Workspace Policy;
- P0-P5 revalidation;
- AI Red Team Assurance;
- CodeQL/dependency security;
- Production Security Posture;
- Release Governance;
- V6 Operational Certification;
- production smoke/SLO checks.

Post-implementation revalidation found and fixed two integration-contract defects: missing canonical registration for the Job Monitor domain route and a stale UX verification assumption. Those fixes were merged before the implementation was declared green.

## 6. Migration and database safety

The project previously experienced migration-history drift; therefore database work must remain forward-only and evidence driven.

Rules:

1. Never reset or repair migration history without current evidence that repair is required.
2. Use additive migrations first.
3. Separate schema changes, backfills, read/write cutovers, and cleanup where practical.
4. Do not let two parallel branches independently redefine the same table contract.
5. Verify clean reconstruction for material schema changes.
6. Never delete an index merely because an advisor labels it unused or duplicate; inspect query evidence first.
7. Preserve RLS and project/organization isolation.

## 7. Current security/performance review backlog

The Runtime v2 Phase-0 advisor review classified the current findings rather than treating them as an automatic migration queue.

- service/control-plane tables with RLS but no user policies are intentional where `anon`/`authenticated` have no direct table privileges;
- authenticated SECURITY DEFINER membership/runtime helpers remain intentional governed surfaces with explicit empty `search_path` and server-side authorization;
- `governance.agent_risk_rank(text)` mutable-search-path hardening is complete via the forward-only `20260915013000_harden_agent_risk_rank_search_path.sql` migration;
- leaked-password protection remains an external Supabase Auth configuration opportunity;
- current live advisor evidence reports 44 unindexed foreign-key candidates and 473 indexes with zero observed scans; both remain benchmark-later until representative workload evidence justifies changes;
- the current exact catalog-level duplicate-index comparison found no exact duplicate index pairs;
- seven current RLS-with-no-policy Runtime v2 tables were directly verified as service/control-plane-only: anon/authenticated have no table DML privileges while service_role retains required access.

See `Architecture/2026-09-15-supabase-advisor-and-index-review.md`.

## 8. Runtime v2 frozen product decisions

### Retention and evidence

- agent-generated artifacts: configurable retention within **5–7 years**;
- agent-to-agent messages: same lifecycle as execution/audit records;
- Governance Admin legal hold prevents normal expiry/deletion.

### Cost and usage visibility

- authorized project users may view cost/token usage for runs they are authorized to view;
- admins receive aggregate reporting.

### Concurrency and execution budgets

Use optimized configurable defaults rather than hard-coded limits. Admins may increase or reduce limits without code changes.

Budgets include where applicable:

- concurrent runs;
- runtime duration;
- token budget;
- cost budget;
- step count;
- tool-call count;
- delegation depth.

### Provider fallback

Automatic fallback is permitted only to **pre-approved providers/models** that satisfy the same or stronger data-residency, security, governance, and production-eligibility requirements.

### Agent versions

A new version does **not** automatically become production default. Lifecycle requires explicit promotion to `ACTIVE`; previous versions remain available for rollback and immutable historical audit.

### Tools

Tools have independent governance even when their parent agent is enabled, including:

- enable/disable state;
- environment restrictions;
- authorization;
- schema validation;
- limits and audit requirements.

### Multi-agent delegation

Agent-to-agent delegation is explicit allow-list only, with configurable depth and budget limits. Handoff authorization must happen before side effects.

## 9. Additional platform defaults approved for Runtime v2

- **RTO:** 4 hours
- **RPO:** 15 minutes
- **Approval validity:** configurable, default 7 days
- **Material fingerprint change:** immediately invalidates existing approval
- **Legal hold:** Governance Admin supported
- **Kill switch:** global, project, agent, and tool scopes
- **Execution budgets:** configurable and server-authoritative
- **Model/provider production promotion:** explicit approval required
- **Canary rollout:** required for material runtime/model/provider changes
- **CRITICAL production mutations:** mandatory human approval remains
- **Break-glass production execution:** not supported; fail closed. No emergency path may bypass normal authorization or approval controls.

## 10. Native-first architecture requirements

ADR-007 and ADR-008 remain authoritative.

For every significant Runtime v2 capability, perform a capability challenge using:

**Status:** `ADVANTAGE`, `PARITY`, `PARTIAL`, `GAP_REQUIRED`, `GAP_DEFERRED`, `NOT_APPLICABLE`

**Disposition:** `KEEP`, `BUILD_NOW`, `BUILD_LATER`, `BORROW_PATTERN`, `EXTENSION_POINT`, `BENCHMARK_LATER`, `REJECT`, `NOT_APPLICABLE`

DataNexus retains authority over identity, tenant/project scope, RLS/authorization, tool allowlists, mutation policy, risk, human approvals, evidence/audit, durable business-job truth, retries/idempotency, rollback/recovery, model routing/evaluation, learning authority, privacy, and secrets.

## 11. Runtime v2 implementation program

The active objective is now **DataNexus Agent Policy v2 + Agent Runtime & Execution Orchestration v2** as one production-ready governed execution platform.

Expanded scope:
1. deterministic Job Monitor execute/retry/cancel/approve/admin capabilities;
2. secret hygiene;
3. PROJECT_STATE_v2 continuity;
4. documentation consolidation;
5. approval administration UX;
6. delegation management UX;
7. external notification UX;
8. Supabase advisor review;
9. duplicate/unused index review;
10. notification delivery robustness;
11. resource ACL administration;
12. tool input/output validation;
13. artifact governance;
14. message governance;
15. SLA enforcement automation;
16. cost/token accounting;
17. approval/runtime integration depth;
18. Job Monitor deeper drilldown;
19. runtime observability;
20. execution concurrency controls;
21. production provider resilience;
22. performance/load testing;
23. agent version lifecycle;
24. chaos/failure testing;
25. governed tool execution;
26. end-to-end agent acceptance;
27. multi-agent orchestration;
28. failure/recovery framework;
29. Agent Runtime & Execution Orchestration v2.

Actual secret rotation remains a separate operational action. Hygiene controls are in scope; rotation is not assumed.

### Policy hold: break-glass semantics

ADR-008 states that break-glass execution is not supported. A later Runtime v2 checkpoint mentions time-limited break-glass access. Until a product-policy decision explicitly reconciles those statements, implementation must fail closed: **no break-glass production execution path may be introduced**. This is a documented policy hold, not permission to weaken approval or execution controls.

Items 2–29 are sufficiently specified for autonomous implementation subject to that fail-closed hold and normal external-credential boundaries.

Optimized execution phases:

1. **Phase 0 — Baseline/contracts:** documentation, advisor/index review, Runtime v2 contracts, capability-parity baseline.
2. **Phase 1 — Governance/control-plane:** approval/delegation UX, notifications, ACL/tool validation, artifact/message governance.
3. **Phase 2 — Runtime governance/observability:** SLA automation, approval revalidation, cost/telemetry, Job Monitor drilldown, concurrency/budgets.
4. **Phase 3 — Runtime core:** durable state machine, agent version lifecycle, provider resilience, governed tool execution.
5. **Phase 4 — Orchestration/recovery:** allow-listed multi-agent delegation, deterministic recovery, emergency controls, canary/promotion controls.
6. **Phase 5 — Continuous evaluation:** trajectory evidence becomes a first-class artifact throughout implementation.
7. **Phase 6 — Independent certification:** performance/load, chaos/failure, E2E acceptance, adversarial/security testing.
8. **Phase 7 — Capability-parity certification:** explicit evidence-backed gap ledger.
9. **Phase 8 — Production rollout:** preview → validated test → canary → monitored production → full production.

## 12. Autonomous operating rules

- Use up to 5 parallel streams where dependencies allow.
- Do not ask routine implementation questions.
- If a task requires user MFA/login/consent, new external account authorization, unresolved business policy, or an unsafe destructive action, mark it blocked and continue independent work.
- If the same failure occurs twice without new evidence, stop repeating the same approach and choose a materially different approach or isolate the blocker.
- Do not weaken tests, authorization, SLO thresholds, or governance merely to make CI pass.
- Prefer reversible, additive, forward-only changes.
- An item is complete only after relevant unit/negative/adversarial/integration validation, exact-head CI, preview/production checks where applicable, and evidence/documentation updates.

### Post-implementation certification

The expanded Runtime v2 program is not complete at merge time. Final certification requires:

1. requirement-to-code-to-test evidence reconciliation;
2. unit tests;
3. negative and failure-case tests;
4. independent adversarial audit;
5. clean database reconstruction and migration validation;
6. integration and end-to-end persona acceptance;
7. performance/load certification;
8. chaos/fault-injection certification;
9. security and secret-hygiene review;
10. exact-head protected CI;
11. preview validation;
12. controlled production canary;
13. production revalidation;
14. rollback/recovery exercise;
15. final documentation and evidence reconciliation.

A validation suite must be capable of disproving the implementation rather than simply mirroring it.

## 13. Immediate next work

Current Phase 0 workstreams:

- **Stream A:** update durable project state and consolidate architecture/decision records.
- **Stream B:** Supabase security/performance advisor and duplicate/unused-index review.
- **Stream C:** Runtime v2 master contracts and migration ownership boundaries.
- **Stream D:** capability-parity baseline and acceptance evidence matrix.

Do not revert to the old queue that treated `/agents` as a static placeholder; that state is obsolete.

## 14. Continuity rule

At the start of a future session:

1. Read `AGENTS.md`, ADR-007, ADR-008, and this file.
2. Fetch current `main` and active PR state before changing code.
3. Inspect relevant migrations and runtime contracts.
4. Continue from the current Runtime v2 phase/workstream, not from historical placeholder-era assumptions.
5. Reconcile documentation whenever runtime evidence has moved ahead of the checkpoint.
