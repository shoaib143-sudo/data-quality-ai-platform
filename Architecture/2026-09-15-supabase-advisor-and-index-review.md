# Supabase Advisor and Index Review — Runtime v2 Phase 0

**Date:** 2026-09-15  
**Refreshed:** 2026-09-19  
**Project:** `tvjnavjxuehpesxcfvrx`  
**Disposition:** evidence-based review; no blind warning cleanup

## Executive conclusion

## 2026-09-19 live refresh

A fresh production-project advisor review was executed against Supabase project `tvjnavjxuehpesxcfvrx`.

### Security snapshot

- `rls_enabled_no_policy`: **7 INFO findings**.
- `authenticated_security_definer_function_executable`: **5 WARN findings**.
- leaked-password protection: **1 WARN** and remains an external Supabase Auth configuration item.
- The seven current RLS-with-no-policy tables are `agent.governed_handoffs`, `agent.governed_run_gates`, `governance.agent_approval_authority_audit`, `governance.governance_orchestrator_runs`, `governance.governance_outcome_reports`, `governance.orchestrator_autonomy_policies`, and `orchestration.governance_recovery_events`.
- Direct privilege verification confirmed that `anon` and `authenticated` have no SELECT/INSERT/UPDATE/DELETE access to those seven tables while `service_role` retains required control-plane access.
- The five authenticated SECURITY DEFINER findings remain governed runtime/membership helper surfaces already documented below. No new function class appeared in this refresh.

### Performance/index snapshot

- `unindexed_foreign_keys`: **44 INFO findings**.
- `pg_stat_user_indexes` currently reports **473 indexes with zero observed scans**.
- A catalog-level exact duplicate comparison returned **0 exact duplicate index pairs**.
- No index deletion is authorized from these counts alone. The zero-scan set includes primary/unique indexes and newly introduced runtime/governance structures, so removal requires representative workload evidence and query-plan validation.
- The increased FK-advisor count reflects newly added Runtime v2 tables and relationships. These remain `BENCHMARK_LATER` candidates unless load evidence demonstrates measurable join/delete/update contention.

The reproducible read-only evidence queries are checked in at `scripts/review-runtime-v2-database-advisors.sql`.

The current Supabase advisor output contains one small database-hardening defect suitable for immediate remediation, several intentional service/control-plane patterns, one external Auth configuration item, and performance advisories that do not justify destructive index changes at current scale.

## Security advisor

### 1. RLS enabled with no policies — 11 INFO findings

Affected tables include the runtime manifest, release-assurance evidence, Agent Policy authority/decision/delegation/outbox/request tables, conversation overrides, AI red-team evidence, project policy context, and resource ACL grants.

Direct privilege verification showed for all 11 tables:

- `anon`: no SELECT privilege;
- `authenticated`: no SELECT/INSERT/UPDATE/DELETE privileges;
- `service_role`: full control-plane privileges.

**Classification:** intentional service/control-plane isolation, not an authorization defect.  
**Action:** `KEEP`. Do not add permissive RLS policies merely to silence the advisor.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### 2. `governance.agent_risk_rank` mutable search path — 1 WARN

The function is a simple immutable risk-to-rank mapping and has no authenticated/anon EXECUTE privilege, but it does not set an explicit `search_path`.

**Classification:** genuine low-risk hardening gap.  
**Action:** `BUILD_NOW`. Add `SET search_path TO ''` through a forward-only migration and re-run advisor checks.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### 3. Signed-in users can execute SECURITY DEFINER functions — 5 WARN findings

Functions:

- `agent.resolve_runtime_interrupt(...)`
- `app_private.is_org_admin(uuid)`
- `app_private.is_org_member(uuid)`
- `app_private.is_project_admin(uuid)`
- `app_private.is_project_member(uuid)`

Evidence:

- all five already use `SET search_path TO ''`;
- anonymous EXECUTE is absent;
- authenticated EXECUTE is present;
- membership/admin helpers are the deliberate identity/RLS helper boundary;
- `resolve_runtime_interrupt` authenticates with `auth.uid()`, authorizes through project-admin scope before locking the interrupt, avoids existence disclosure, validates interrupt status/expiry, checks the action-payload hash, and records timeout/escalation evidence.

**Classification:** intentional governed execution surface.  
**Action:** `KEEP`, with regression/adversarial coverage. Revoking authenticated EXECUTE from the membership helpers could break RLS/policy behavior; changing `resolve_runtime_interrupt` without a replacement authorization route would weaken the intended HITL control path.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

### 4. Leaked password protection disabled — 1 WARN

**Classification:** real Auth hardening opportunity, but configured at Supabase Auth/account level rather than by application SQL migration.  
**Action:** `BUILD_NOW` when the setting is available under the current plan/account; treat as an external configuration task rather than modifying application authorization logic.

Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Performance advisor

### 1. Unindexed foreign keys — 26 INFO findings

The findings span runtime/checkpoint/interrupt/replay/tool-invocation tables, Agent Policy governance tables, and recovery records.

Current relation-size inspection shows the affected Runtime v2/control-plane tables are very small (largest inspected relation approximately 144 KiB; most are tens of KiB). This phase has no evidence of FK-driven latency or delete/update contention.

**Classification:** optimization candidates, not current defects.  
**Action:** `BENCHMARK_LATER`. Reassess in Phase 6 load testing using real join/delete/update paths and add indexes where measured plans justify them. Do not create 26 indexes merely because a linter can enumerate missing FK coverage.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

### 2. No primary key — 2 INFO findings

Affected tables are test/validation-oriented:

- `jdbc_test.customer_data`
- `profiling_validation.synthetic_customers`

**Classification:** non-production fixture/validation concern unless these tables become durable production entities.  
**Action:** `KEEP` for now; revisit only if their lifecycle changes.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key

### 3. Unused indexes — 227 INFO findings

The database contains many recently introduced governance/catalog/runtime structures. An index showing zero observed scans does not establish redundancy, especially before meaningful production workload has exercised new paths.

A catalog-level exact-duplicate check comparing schema, table, uniqueness/primary flags, indexed keys/expressions, and predicates returned **no exact duplicate index pairs**.

**Classification:** no evidence-backed duplicate index removal currently available.  
**Action:** `KEEP` existing indexes during Runtime v2 implementation. Re-evaluate after representative load tests and a sufficiently long production observation window.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Immediate remediation selected

Only the following database change is justified now from the current advisor evidence:

1. Harden `governance.agent_risk_rank(text)` with an explicit empty `search_path`.

The following are explicitly not being changed merely to make advisor counts smaller:

- service-only RLS tables;
- authenticated SECURITY DEFINER membership helpers;
- governed runtime interrupt resolution;
- unindexed foreign keys without measured performance need;
- currently unused indexes without redundancy/workload evidence.

## Runtime v2 follow-up gates

- Re-run security and performance advisors after every material DDL phase.
- Include FK/index plan checks in Phase 6 load testing.
- Treat any future direct `anon`/`authenticated` grant on the service-only policy tables as a security regression.
- Preserve explicit `search_path` hardening on all SECURITY DEFINER functions.
- Keep database advisor output as evidence, not as an automatic migration generator.
