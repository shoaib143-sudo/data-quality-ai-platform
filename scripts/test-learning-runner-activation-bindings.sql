\set ON_ERROR_STOP on

do $$
declare
  v_table text;
  v_index text;
  v_policy text;
  v_function regprocedure;
begin
  foreach v_table in array array[
    'learning_artifact_manifests',
    'learning_evaluation_runtime_bindings',
    'learning_evaluator_assignments'
  ] loop
    if to_regclass('agent.'||v_table) is null then
      raise exception 'missing activation table: %',v_table;
    end if;
    if not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='agent' and c.relname=v_table and c.relrowsecurity
    ) then raise exception 'RLS is not enabled on agent.%',v_table; end if;
    if exists(
      select 1 from information_schema.role_table_grants
      where table_schema='agent' and table_name=v_table
        and grantee in ('PUBLIC','anon','authenticated')
    ) then raise exception 'browser/public table grant detected on agent.%',v_table; end if;
    if exists(
      select 1 from information_schema.role_table_grants
      where table_schema='agent' and table_name=v_table
        and grantee='service_role' and privilege_type not in ('SELECT','INSERT')
    ) then raise exception 'service_role has excessive table privilege on agent.%',v_table; end if;
    if not exists(
      select 1 from information_schema.role_table_grants
      where table_schema='agent' and table_name=v_table
        and grantee='service_role' and privilege_type='SELECT'
    ) or not exists(
      select 1 from information_schema.role_table_grants
      where table_schema='agent' and table_name=v_table
        and grantee='service_role' and privilege_type='INSERT'
    ) then raise exception 'service_role minimal table privileges missing on agent.%',v_table; end if;
  end loop;

  foreach v_policy in array array[
    'learning_artifact_manifests_authenticated_deny',
    'learning_runtime_bindings_authenticated_deny',
    'learning_evaluator_assignments_authenticated_deny'
  ] loop
    if not exists(select 1 from pg_policies where schemaname='agent' and policyname=v_policy) then
      raise exception 'missing explicit authenticated deny policy: %',v_policy;
    end if;
  end loop;

  foreach v_index in array array[
    'learning_artifact_executable_role_uq',
    'learning_artifact_held_out_case_uq',
    'learning_artifact_definition_fk_idx',
    'learning_artifact_candidate_fk_idx',
    'learning_artifact_case_fk_idx',
    'learning_artifact_created_by_fk_idx',
    'learning_runtime_binding_policy_fk_idx',
    'learning_runtime_binding_candidate_fk_idx',
    'learning_runtime_binding_baseline_definition_fk_idx',
    'learning_runtime_binding_candidate_definition_fk_idx',
    'learning_runtime_binding_rollback_definition_fk_idx',
    'learning_runtime_binding_baseline_artifact_fk_idx',
    'learning_runtime_binding_candidate_artifact_fk_idx',
    'learning_evaluator_policy_fk_idx',
    'learning_evaluator_candidate_fk_idx',
    'learning_evaluator_proposer_fk_idx',
    'learning_evaluator_evaluator_fk_idx',
    'learning_evaluator_assigned_by_fk_idx'
  ] loop
    if to_regclass('agent.'||v_index) is null then raise exception 'missing activation index: %',v_index; end if;
  end loop;

  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='agent' and not t.tgisinternal and t.tgname in (
        'learning_artifact_manifests_immutable','learning_runtime_bindings_immutable','learning_evaluator_assignments_immutable'
      )) <> 3 then raise exception 'activation immutability triggers are incomplete'; end if;

  foreach v_function in array array[
    to_regprocedure('agent.register_learning_artifact_manifest(uuid,text,text,uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,text,uuid)'),
    to_regprocedure('agent.register_learning_runtime_binding(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text)'),
    to_regprocedure('agent.register_learning_evaluator_assignment(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)')
  ] loop
    if v_function is null then raise exception 'activation registration function is missing'; end if;
    if not (select prosecdef from pg_proc where oid=v_function) then raise exception 'activation registration function must be security definer: %',v_function; end if;
    if has_function_privilege('authenticated',v_function,'EXECUTE') or has_function_privilege('anon',v_function,'EXECUTE') then
      raise exception 'browser role can execute activation function: %',v_function;
    end if;
    if not has_function_privilege('service_role',v_function,'EXECUTE') then
      raise exception 'service_role execution privilege missing: %',v_function;
    end if;
  end loop;
end
$$;

\echo 'Learning runner activation binding full-schema ACL/index/immutability assertions passed.'
