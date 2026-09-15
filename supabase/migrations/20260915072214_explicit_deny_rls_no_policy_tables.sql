create policy "deny_direct_client_access"
on agent.agent_run_runtime_manifests
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.evidence_legal_holds
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on agent.evidence_retention_policies
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on app.release_assurance_evidence
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_authorities
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_decisions
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_delegations
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_notification_outbox
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_approval_requests
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.agent_conversation_overrides
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.ai_red_team_evidence
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.analysis_evidence_envelopes
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.learning_case_assessments
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.metric_definition_versions
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.project_agent_policy_context
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access"
on governance.resource_access_grants
for all
to anon, authenticated
using (false)
with check (false);
