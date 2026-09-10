begin;

do $migration$
declare
  v_body text;
  v_start_old constant text := $needle$v_instance_id := governance.start_workflow(v_workflow_id,'DATASET',v_dataset_id,null,jsonb_build_object('synthetic',true));$needle$;
  v_start_new constant text := $needle$v_instance_id := governance.start_workflow(v_workflow_id,'DATASET',v_dataset_id,v_reviewer_id,jsonb_build_object('synthetic',true));$needle$;
  v_first_old constant text := $needle$perform governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic steward approval','{}'::jsonb);$needle$;
  v_first_new constant text := $needle$perform governance.act_workflow(v_instance_id,v_reviewer_id,'APPROVE','Synthetic steward approval','{}'::jsonb);$needle$;
  v_second_old constant text := $needle$v_workflow_result := governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic owner approval','{}'::jsonb);$needle$;
  v_second_new constant text := $needle$v_workflow_result := governance.act_workflow(v_instance_id,v_reviewer_id,'APPROVE','Synthetic owner approval','{}'::jsonb);$needle$;
begin
  select p.prosrc
    into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'governance'
    and p.proname = 'run_synthetic_governance_integration_suite'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_body is null then
    raise exception 'Synthetic governance integration suite function is missing';
  end if;
  if strpos(v_body, v_start_old) = 0 then
    raise exception 'Synthetic workflow starter compatibility patch no longer matches the expected function body';
  end if;
  if strpos(v_body, v_first_old) = 0 then
    raise exception 'Synthetic first workflow action compatibility patch no longer matches the expected function body';
  end if;
  if strpos(v_body, v_second_old) = 0 then
    raise exception 'Synthetic second workflow action compatibility patch no longer matches the expected function body';
  end if;

  v_body := replace(v_body, v_start_old, v_start_new);
  v_body := replace(v_body, v_first_old, v_first_new);
  v_body := replace(v_body, v_second_old, v_second_new);

  execute format(
    'create or replace function governance.run_synthetic_governance_integration_suite() returns jsonb language plpgsql security definer set search_path to %L, %L, %L, %L, %L, %L as %L',
    'pg_catalog', 'governance', 'profiling', 'catalog', 'orchestration', 'app', v_body
  );
end;
$migration$;

commit;
