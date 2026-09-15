drop policy "deny_direct_client_access" on agent.agent_run_runtime_manifests;
create policy "deny_direct_client_access" on agent.agent_run_runtime_manifests as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on agent.evidence_legal_holds;
create policy "deny_direct_client_access" on agent.evidence_legal_holds as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on agent.evidence_retention_policies;
create policy "deny_direct_client_access" on agent.evidence_retention_policies as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on app.release_assurance_evidence;
create policy "deny_direct_client_access" on app.release_assurance_evidence as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_approval_authorities;
create policy "deny_direct_client_access" on governance.agent_approval_authorities as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_approval_decisions;
create policy "deny_direct_client_access" on governance.agent_approval_decisions as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_approval_delegations;
create policy "deny_direct_client_access" on governance.agent_approval_delegations as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_approval_notification_outbox;
create policy "deny_direct_client_access" on governance.agent_approval_notification_outbox as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_approval_requests;
create policy "deny_direct_client_access" on governance.agent_approval_requests as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.agent_conversation_overrides;
create policy "deny_direct_client_access" on governance.agent_conversation_overrides as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.ai_red_team_evidence;
create policy "deny_direct_client_access" on governance.ai_red_team_evidence as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.analysis_evidence_envelopes;
create policy "deny_direct_client_access" on governance.analysis_evidence_envelopes as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.learning_case_assessments;
create policy "deny_direct_client_access" on governance.learning_case_assessments as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.metric_definition_versions;
create policy "deny_direct_client_access" on governance.metric_definition_versions as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.project_agent_policy_context;
create policy "deny_direct_client_access" on governance.project_agent_policy_context as restrictive for all to anon, authenticated using (false) with check (false);

drop policy "deny_direct_client_access" on governance.resource_access_grants;
create policy "deny_direct_client_access" on governance.resource_access_grants as restrictive for all to anon, authenticated using (false) with check (false);
