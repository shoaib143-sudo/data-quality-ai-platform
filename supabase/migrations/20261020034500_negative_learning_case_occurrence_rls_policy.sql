-- Preserve deny-by-default access while satisfying explicit RLS policy posture.
-- Occurrence rows are service-role evidence and are not exposed to signed-in users.

drop policy if exists negative_learning_case_occurrences_authenticated_deny
  on agent.negative_learning_case_occurrences;

create policy negative_learning_case_occurrences_authenticated_deny
  on agent.negative_learning_case_occurrences
  as restrictive
  for select
  to authenticated
  using (false);

revoke all on agent.negative_learning_case_occurrences
  from public, anon, authenticated;
grant select, insert on agent.negative_learning_case_occurrences
  to service_role;

comment on policy negative_learning_case_occurrences_authenticated_deny
  on agent.negative_learning_case_occurrences is
  'Explicit deny-by-default policy. Negative-case occurrence evidence remains service-role-only.';
