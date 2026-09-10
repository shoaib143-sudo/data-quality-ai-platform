-- Security Advisor hardening: these tables are internal/service-owned and intentionally
-- have no direct anon/authenticated data access. Make the existing fail-closed posture
-- explicit with RLS policies so the intent is durable and advisor-visible.
--
-- service_role and table owners retain their existing privileges; these policies only
-- target anon/authenticated and therefore do not broaden client access.

create policy "internal_service_only_deny_clients"
on governance.ai_model_cost_events
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on governance.embedding_spaces
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on governance.governed_action_outcomes
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on governance.landing_page_settings
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on orchestration.job_dependencies
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on orchestration.source_concurrency_state
for all
to anon, authenticated
using (false)
with check (false);

create policy "internal_service_only_deny_clients"
on orchestration.worker_dispatch_state
for all
to anon, authenticated
using (false)
with check (false);
