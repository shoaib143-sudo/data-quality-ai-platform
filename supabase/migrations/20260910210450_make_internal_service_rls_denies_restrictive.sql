-- Follow-up hardening: PostgreSQL policies are permissive by default and permissive
-- policies combine with OR. Recreate these internal/service-only deny policies as
-- restrictive so a future permissive policy cannot accidentally broaden client access.

 drop policy "internal_service_only_deny_clients" on governance.ai_model_cost_events;
 create policy "internal_service_only_deny_clients"
 on governance.ai_model_cost_events
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on governance.embedding_spaces;
 create policy "internal_service_only_deny_clients"
 on governance.embedding_spaces
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on governance.governed_action_outcomes;
 create policy "internal_service_only_deny_clients"
 on governance.governed_action_outcomes
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on governance.landing_page_settings;
 create policy "internal_service_only_deny_clients"
 on governance.landing_page_settings
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on orchestration.job_dependencies;
 create policy "internal_service_only_deny_clients"
 on orchestration.job_dependencies
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on orchestration.source_concurrency_state;
 create policy "internal_service_only_deny_clients"
 on orchestration.source_concurrency_state
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);

 drop policy "internal_service_only_deny_clients" on orchestration.worker_dispatch_state;
 create policy "internal_service_only_deny_clients"
 on orchestration.worker_dispatch_state
 as restrictive
 for all
 to anon, authenticated
 using (false)
 with check (false);
