# DataNexus AI — Implementation Handoff and Transfer Prompt

Date: 2026-09-11

This record is the executable continuation prompt paired with the fuller architecture checkpoint in `Architecture/2026-09-11-chat-handoff-summary-and-next-agent-prompt.md`.

## Current handoff baseline

At the point this chat was handed over, the verified repository `main` head was:

`4f7ad25cbaa301da9e5c8a1d30178c23439ff926`

Commit:

`OPA: remove deprecated runtime flag on current main (#226)`

The next agent must re-read `main` before working because the repository advances frequently through parallel implementation.

## What this chat accomplished

The chat began by taking over an implementation-first DataNexus / Data Governance PowerHouse continuation. The operating rule throughout was to inspect current live state, implement real changes, add permanent regression checks, run exact-head CI, merge only green, apply Supabase migrations when required, and verify production rather than stopping at design discussion.

Major outcomes reached in this chat:

- Supabase Security Advisor RLS hardening merged in PR #212.
- JDBC availability/readiness deployment contracts merged in PR #213.
- Retrieval authority/temporal metadata normalization merged in PR #214.
- Fail-closed OPA application policy-enforcement provider merged in PR #215.
- Governed OTLP application telemetry-export boundary merged in PR #216.
- Strict governed retrieval authority/temporal reconciliation merged in PR #218; #217 was superseded.
- JDBC connector application timeout was aligned with the bridge contract in PR #220.
- Authenticated fail-closed OPA external-service deployment code merged in PR #223.
- Authenticated OpenTelemetry Collector deployment code merged on current main in PR #224; #222 was superseded.
- OPA runtime flag cleanup merged in PR #226 and is the current main head at handoff.

The chat also verified that generalized AI budget-scope composition was already implemented/live and therefore should not be rebuilt.

## Supabase / security state

The seven actionable `rls_enabled_no_policy` findings were fixed with restrictive fail-closed policies.

Four `app_private` `SECURITY DEFINER` membership/admin helper warnings remain intentionally because they are required for non-recursive RLS evaluation, are read-only, are not anon/public executable, and `app_private` is not PostgREST-exposed.

Two no-primary-key notices remain on profiling/JDBC fixtures because adding synthetic identifiers solely for the advisor would alter the profiling fixtures.

Unused-index notices must not be removed merely because they have zero scans. No exact duplicate-index set was found; wait for real workload evidence.

The user explicitly chose to stay on **Supabase Free**. Therefore leaked-password protection remains an accepted Free-plan/control-plane limitation. Do not implement a custom substitute solely to clear the advisor.

## Worker / Render state

The user explicitly authorized the `Demo-PwC Workspace` Render workspace.

The checked runtime window showed no current 403/Forbidden/Unauthorized evidence. Do not weaken worker authentication based only on historical 403s.

At handoff, the live Render service list contained only:

- `datanexus-jdbc-bridge`

Although OPA and OTLP deployment code is now merged, **the live OPA PDP and live OTLP collector have not yet been proven present in Render**. This distinction is important: merged deployment code is not the same as a deployed external service.

## Governance and architecture invariants that must not change

- One deployment = one organization = dedicated DB/infrastructure.
- The dedicated DB is the runtime tenant boundary.
- `app.organizations` must resolve to exactly one organization; zero/multiple fail closed.
- No runtime organization switching and no first-membership tenant selection.
- `organization_id` remains for integrity/audit, not runtime tenant selection.
- Organization administration and governance persona are separate.
- Preserve exactly 13 governance personas.
- Do not introduce `Data Analyst` or `Data Engineer` without an ADR.
- `Data Governance Admin` does not automatically receive `/admin`.
- Preserve `service_role` SELECT on `governance.control_evaluations`.
- PostgreSQL/Supabase is canonical for governed state/evidence.
- Observation is not governance authority.
- AI suggestion is not human/governed authority.
- Inferred lineage is not source-observed lineage.
- External OPA may preserve/strengthen canonical policy, never weaken it or become canonical authority.
- External OTLP is observational only; PostgreSQL telemetry persists first.
- W3C trace IDs are observability only.
- Budgets are execution/quota controls, not approval authority.
- Never invent pricing, approvals, labels, membership, lineage, evidence, or credentials to make tests pass.

## Profiling and onboarding lifecycles

Profiling:

Dataset -> Dataset Version -> Profile Run -> Schema Discovery -> Profile Columns -> Metric Execution -> Metric Results -> Findings -> Quality Score -> Governance Insights -> Validation

Source onboarding:

Dataset Registration -> Dataset Version Management -> Source Configuration -> Connectivity -> Validation -> Schema Availability -> Profiling Ready

CSV upload and DB-table profiling must converge on the same governed profiling lifecycle. Preserve the common JDBC abstraction and Java 21 / Spring Boot JDBC bridge.

## Immediate continuation target

The highest-value unfinished implementation/integration is no longer writing OPA/OTLP code; that code is merged. The next step is to complete their **live external deployment and production wiring** without fabricating readiness.

Proceed in parallel where possible:

### OPA lane

1. Re-read current `main` and verify PR #223/#226 content is present.
2. Create a Render web service in `Demo-PwC Workspace` from current `main` using the committed OPA build/start scripts.
3. Use a distinct strong `OPA_AUTH_TOKEN` stored as a runtime secret; never commit it.
4. Verify `/health` is reachable.
5. Verify the decision endpoint rejects unauthenticated requests.
6. Verify an authenticated canonical-policy request returns the governed contract.
7. Verify stale/missing/malformed authority fails closed.
8. Only after the service passes standalone verification, configure Vercel production with `POLICY_DECISION_PROVIDER=opa`, `OPA_URL`, `OPA_DECISION_PATH`, `OPA_AUTH_TOKEN`, and the existing timeout setting as appropriate.
9. Redeploy and verify exact production commit SHA and logs.

### OTLP lane

1. Re-read current `main` and verify PR #224 collector scripts/config are present.
2. Create a Render web service in `Demo-PwC Workspace` from current `main` using the committed collector build/start scripts.
3. Use a distinct strong `OTEL_AUTH_TOKEN` stored as a runtime secret; never commit it.
4. Verify unauthenticated `/v1/traces` ingestion is rejected.
5. Verify authenticated OTLP/HTTP JSON trace ingestion succeeds.
6. Verify collector receipt evidence at basic/debug verbosity without dumping prompt/reasoning/free-form payloads.
7. Only after standalone verification, set the application `OTEL_EXPORTER_OTLP_*` / `OTEL_SERVICE_NAME` production configuration in Vercel.
8. Redeploy and verify exact production SHA and Vercel/Render logs.

The Vercel connector available in this chat exposed deployment/log operations but no direct environment-variable mutation operation. If the next agent has the same tool limitation, the exact blocker is Vercel production environment configuration; do not claim live integration until the env vars are actually set.

## Other residual external/evidence items

After OPA/OTLP live wiring, remaining non-code or evidence-dependent work includes:

- Databricks `system.access` privileges for source-authoritative lineage where required.
- Genuine governed retrieval relevance labels/data; do not create synthetic governance evidence.
- Supabase leaked-password protection while the user remains on Free.
- Sufficient real workload evidence before deleting any unused index.

Historical open PRs such as #209, #206, #173, #172, #102, #101, #100, #97, and #73 are stale until reconciled against `main`. Do not merge them merely because they remain open.

## Transfer prompt for the next implementation agent

```text
You are taking over implementation of DataNexus AI / Data Governance PowerHouse in GitHub repository `shoaib143-sudo/data-quality-ai-platform`.

SOURCE OF TRUTH
Use the current live repository plus `Architecture/` and `Major discussion/` continuation records. Start from current `main`, never from an old feature branch. At handoff the verified main SHA was:

`4f7ad25cbaa301da9e5c8a1d30178c23439ff926`

Commit: `OPA: remove deprecated runtime flag on current main (#226)`

Re-read `main` immediately because it may have advanced.

READ FIRST
- `Architecture/README.md`
- `Architecture/2026-09-09-ADR-006-implementation-state-and-next-targets.md`
- `Architecture/2026-09-10-ADR-007-single-organization-deployment-boundary.md`
- `Architecture/2026-09-11-chat-handoff-summary-and-next-agent-prompt.md`
- `Major discussion/2026-09-10-role-experience-implementation-and-operational-checkpoint.md`
- `Major discussion/2026-09-11-chat-handoff-summary-and-next-agent-prompt.md`

EXECUTION STYLE
Implementation-first and autonomous. Do not stop at recommendations when a real change can be made. Parallelize independent work. For each target use:

inspect -> implement -> permanent verifier/tests -> PR -> exact-head CI -> merge only green -> apply Supabase migration if needed -> verify exact production deployment SHA -> inspect advisors/runtime logs -> continue

NON-NEGOTIABLE ARCHITECTURE
- One DataNexus deployment = one organization = dedicated DB/infrastructure.
- Dedicated DB is the runtime tenant boundary.
- `app.organizations` must resolve to exactly one organization; zero or multiple fail closed.
- No runtime org switching and no first-membership tenant selection.
- Keep `organization_id` for integrity/audit, not runtime tenant selection.
- Membership is required.
- Organization admin and governance persona are separate.
- Preserve exactly 13 governance personas; do not add Data Analyst/Data Engineer without an ADR.
- Data Governance Admin does not imply `/admin`.
- Preserve `service_role` SELECT on `governance.control_evaluations`.
- PostgreSQL/Supabase is canonical governance authority.
- Observation != governance authority.
- AI suggestion != human/governed authority.
- Inferred lineage != source-observed lineage.
- External OPA may only preserve/strengthen canonical policy and must fail closed; it is not canonical authority.
- External OTLP is observational only; PostgreSQL telemetry must persist first.
- W3C trace IDs are observability only.
- Budget controls are quota/execution controls, not approval/deployment authority.
- Never invent pricing, approvals, evidence, lineage, memberships, labels, or credentials.

DO NOT REBUILD COMPLETED WORK
- PR #212 Supabase RLS advisor hardening.
- PR #213 JDBC availability/readiness hardening.
- PR #214 retrieval metadata normalization.
- PR #215 fail-closed OPA application provider.
- PR #216 governed OTLP application exporter.
- PR #218 strict retrieval authority + temporal evidence reconciliation; #217 was superseded.
- PR #220 JDBC application timeout aligned with bridge contract.
- PR #223 authenticated fail-closed OPA external-service deployment code.
- PR #224 authenticated OTLP collector deployment code on current main; #222 was superseded.
- PR #226 OPA runtime flag cleanup.
- Generalized AI budget-scope composition is already implemented/live.
- Earlier single-org, authorization, cost-accounting, V5/V6, profiling/governance foundation work is already landed.

SUPABASE STATE
- Seven RLS-no-policy findings were fixed with restrictive fail-closed policies.
- Four private SECURITY DEFINER membership/admin helper warnings are intentional and required for RLS; do not remove them merely for the advisor.
- Two no-PK fixture notices are intentional profiling/JDBC fixtures.
- Do not delete zero-scan indexes without real workload evidence.
- The user has chosen to remain on Supabase Free; leaked-password protection is an accepted plan/control-plane limitation.

LIVE RENDER STATE AT HANDOFF
Workspace: `Demo-PwC Workspace`.
The live service list showed only `datanexus-jdbc-bridge`.
There was no currently proven OPA or OTLP service in Render even though their deployment code is merged.
Historical worker 403s were investigated; no current 403/Forbidden/Unauthorized evidence was seen in the checked window. Do not weaken worker auth without exact current secret/dispatch evidence.

IMMEDIATE PRIORITY — RUN IN PARALLEL
Lane A: provision and verify a real OPA service on Render from current main.
- use committed `infra/opa` build/start/runtime contracts
- create a strong distinct runtime `OPA_AUTH_TOKEN`
- verify health, unauthenticated denial, authenticated decision contract, stale/malformed fail-closed behavior
- only after standalone verification, wire Vercel production with `POLICY_DECISION_PROVIDER=opa`, `OPA_URL`, `OPA_DECISION_PATH`, `OPA_AUTH_TOKEN` and timeout config
- verify exact Vercel production SHA and logs

Lane B: provision and verify a real OTLP collector on Render from current main.
- use committed `infra/otel` build/start/runtime contracts
- create a strong distinct runtime `OTEL_AUTH_TOKEN`
- verify unauthenticated trace rejection and authenticated OTLP/HTTP JSON acceptance
- verify receipt evidence without exporting prompt/reasoning/free-form payloads
- only after standalone verification, wire Vercel using the existing `OTEL_EXPORTER_OTLP_*` / `OTEL_SERVICE_NAME` config
- verify exact Vercel production SHA and Render/Vercel logs

If the connected Vercel tooling still cannot mutate production environment variables, identify that exact control-plane limitation and stop only that final wiring step; do not falsely mark integration live.

OTHER EXTERNAL/EVIDENCE BOUNDARIES
- Databricks `system.access` privilege-dependent source-authoritative lineage remains external when those privileges are absent.
- Genuine governed retrieval labels require genuine evidence; never fabricate them.
- Supabase leaked-password protection remains unavailable while staying on Free.
- Unused-index cleanup requires workload evidence.

PROTECTED LIFECYCLES
Profiling:
Dataset -> Dataset Version -> Profile Run -> Schema Discovery -> Profile Columns -> Metric Execution -> Metric Results -> Findings -> Quality Score -> Governance Insights -> Validation

Source onboarding:
Dataset Registration -> Dataset Version Management -> Source Configuration -> Connectivity -> Validation -> Schema Availability -> Profiling Ready

ENVIRONMENT
- GitHub: `shoaib143-sudo/data-quality-ai-platform`
- Supabase project: `tvjnavjxuehpesxcfvrx`
- Vercel project: `data-quality-ai-platform`
- Production: `https://data-quality-ai-platform.vercel.app/`
- Render workspace: `Demo-PwC Workspace`

START NOW
1. Re-read current main and recent PRs.
2. Confirm OPA/OTLP code is present and no newer integration already exists.
3. Inspect current Render services.
4. Run the OPA and OTLP provisioning/verification lanes in parallel.
5. Wire production only after standalone external-service verification.
6. Continue until both are live and verified or until an exact control-plane/external blocker is demonstrated.

Do not stop with a status report when an actionable implementation step remains.
```
