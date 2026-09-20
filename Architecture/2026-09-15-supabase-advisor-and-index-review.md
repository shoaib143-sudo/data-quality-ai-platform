# Supabase Advisor and Index Review — Runtime v2 Phase 0

**Date:** 2026-09-15  
**Refreshed:** 2026-09-20  
**Project:** `tvjnavjxuehpesxcfvrx`  
**Disposition:** evidence-based review; no blind warning cleanup

## Executive conclusion

## 2026-09-20 live refresh

A fresh production-project advisor review was executed against Supabase project `tvjnavjxuehpesxcfvrx` after the Agent Runtime v2, governed learning, and R2 checksum-boundary migrations were present in the live catalog.

### Security snapshot

- `rls_enabled_no_policy`: **13 INFO findings**.
- `authenticated_security_definer_function_executable`: **5 WARN findings**.
- leaked-password protection: **1 WARN** and remains an external Supabase Auth configuration item.
- The 13 current RLS-with-no-policy tables are `agent.agent_version_lifecycle`, `agent.agent_version_lifecycle_events`, `agent.governed_handoffs`, `agent.governed_run_gates`, `agent.positive_learning_case_occurrences`, `agent.positive_learning_case_reviews`, `agent.positive_learning_case_usages`, `agent.positive_learning_cases`, `governance.agent_approval_authority_audit`, `governance.governance_orchestrator_runs`, `governance.governance_outcome_reports`, `governance.orchestrator_autonomy_policies`, and `orchestration.governance_recovery_events`.
- Direct privilege verification confirmed that `anon` and `authenticated` have no SELECT/INSERT/UPDATE/DELETE access to all 13 tables while `service_role` retains required control-plane SELECT and DML access.
- The five authenticated SECURITY DEFINER findings remain governed runtime/membership helper surfaces already documented below. No new function class appeared in this refresh.

### Performance/index snapshot

- `unindexed_foreign_keys`: **75 INFO findings**.
- `pg_stat_user_indexes` currently reports **525 indexes with zero observed scans**.
- A catalog-level exact duplicate comparison returned **0 exact duplicate index pairs**.
- No index deletion is authorized from these counts alone. The zero-scan set includes primary/unique indexes and newly introduced runtime/governance structures, so removal requires representative workload evidence and query-plan validation.
- The increased FK-advisor count reflects newly added Runtime v2 tables and relationships. These remain `BENCHMARK_LATER` candidates unless load evidence demonstrates measurable join/delete/update contention.

The reproducible read-only evidence queries are checked in at `scripts/review-runtime-v2-database-advisors.sql`.

The current Supabase advisor output contains intentional service/control-plane patterns, one external Auth configuration item, and performance advisories that do not justify destructive index changes at current scale. The earlier `governance.agent_risk_rank(text)` mutable-search-path finding has already been remediated by the forward-only hardening migration and is absent from the 2026-09-20 live security snapshot.

## Security advisor

### 1. RLS enabled with no policies — 13 INFO findings

Affected tables are the 13 Runtime v2 service/control-plane tables listed in the live refresh above. The six additions are the two agent-version lifecycle tables plus the four proactive positive-learning case tables.

Direct privilege verification showed for all 13 tables:

- `anon`: no SELECT privilege;
- `authenticated`: no SELECT/INSERT/UPDATE/DELETE privileges;
- `service_role`: required control-plane SELECT/INSERT/UPDATE/DELETE privileges.

**Classification:** intentional service/control-plane isolation, not an authorization defect.  
**Action:** `KEEP`. Do not add permissive RLS policies merely to silence the advisor.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### 2. `governance.agent_risk_rank` mutable search path — resolved historical finding

The function is a simple immutable risk-to-rank mapping and has no authenticated/anon EXECUTE privilege. The forward-only migration `20260915013000_harden_agent_risk_rank_search_path.sql` set an explicit empty `search_path`.

**Classification:** remediated.  
**Action:** `DONE`. Preserve the hardening and keep it covered by advisor regression checks.

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

### 1. Unindexed foreign keys — 75 INFO findings

The findings span runtime/checkpoint/interrupt/replay/tool-invocation tables, Agent Policy governance tables, and recovery records.

Current relation-size inspection shows the affected Runtime v2/control-plane tables are very small (largest inspected relation approximately 144 KiB; most are tens of KiB). This phase has no evidence of FK-driven latency or delete/update contention.

**Classification:** optimization candidates, not current defects.  
**Action:** `BENCHMARK_LATER`. Reassess in Phase 6 load testing using real join/delete/update paths and add indexes where measured plans justify them. Do not create 75 indexes merely because a linter can enumerate missing FK coverage.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

### 2. No primary key — 2 INFO findings

Affected tables are test/validation-oriented:

- `jdbc_test.customer_data`
- `profiling_validation.synthetic_customers`

**Classification:** non-production fixture/validation concern unless these tables become durable production entities.  
**Action:** `KEEP` for now; revisit only if their lifecycle changes.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key

### 3. Unused indexes — 256 INFO findings

The database contains many recently introduced governance/catalog/runtime structures. An index showing zero observed scans does not establish redundancy, especially before meaningful production workload has exercised new paths.

A catalog-level exact-duplicate check comparing schema, table, uniqueness/primary flags, indexed keys/expressions, and predicates returned **no exact duplicate index pairs**.

**Classification:** no evidence-backed duplicate index removal currently available.  
**Action:** `KEEP` existing indexes during Runtime v2 implementation. Re-evaluate after representative load tests and a sufficiently long production observation window.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Immediate remediation status

The evidence-backed `governance.agent_risk_rank(text)` search-path hardening is already complete. No additional database mutation is justified solely from the current advisor output.

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
