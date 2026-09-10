begin;

do $migration$
declare
  v_body text;
  v_success_old constant text := $needle$delete from app.organizations where id=v_org_id; v_org_id := null;
    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);$needle$;
  v_success_new constant text := $needle$raise exception using errcode = 'P0001', message = '__SYNTHETIC_GOVERNANCE_SUITE_ROLLBACK__';$needle$;
  v_error_old constant text := $needle$v_error := sqlerrm; if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);$needle$;
  v_error_new constant text := $needle$v_error := sqlerrm;
    if v_error = '__SYNTHETIC_GOVERNANCE_SUITE_ROLLBACK__' then
      update governance.integration_test_runs
      set status='PASSED', checks=v_checks, error_message=null, completed_at=now()
      where id=v_run_id;
      return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks,'cleanup','ROLLED_BACK');
    end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);$needle$;
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
  if strpos(v_body, v_success_old) = 0 then
    raise exception 'Synthetic suite success cleanup patch no longer matches the expected function body';
  end if;
  if strpos(v_body, v_error_old) = 0 then
    raise exception 'Synthetic suite exception cleanup patch no longer matches the expected function body';
  end if;

  v_body := replace(v_body, v_success_old, v_success_new);
  v_body := replace(v_body, v_error_old, v_error_new);

  execute format(
    'create or replace function governance.run_synthetic_governance_integration_suite() returns jsonb language plpgsql security definer set search_path to %L, %L, %L, %L, %L, %L as %L',
    'pg_catalog', 'governance', 'profiling', 'catalog', 'orchestration', 'app', v_body
  );
end;
$migration$;

commit;
