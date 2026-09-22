create policy "deny_direct_client_access"
on agent.agent_version_lifecycle
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.agent_version_lifecycle_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.governed_handoffs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.governed_run_gates
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.positive_learning_case_occurrences
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.positive_learning_case_reviews
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.positive_learning_case_usages
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.positive_learning_cases
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_authority_audit
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.governance_orchestrator_runs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.governance_outcome_reports
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.orchestrator_autonomy_policies
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on orchestration.governance_recovery_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
