alter function governance.evaluate_data_contract(uuid,uuid) rename to evaluate_data_contract_for_contract;

create or replace function governance.evaluate_data_contract(p_profile_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog
as $$
declare
  v_dataset_id uuid;
  v_project_id uuid;
  v_dataset_version_id uuid;
  v_contract_id uuid;
  v_result jsonb;
  v_status text;
  v_fingerprint text;
begin
  select d.id,d.project_id,pr.dataset_version_id into v_dataset_id,v_project_id,v_dataset_version_id
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
  join catalog.datasets d on d.id=dv.dataset_id
  where pr.id=p_profile_run_id;
  if v_dataset_id is null then return jsonb_build_object('status','ERROR','error','dataset not found'); end if;

  select id into v_contract_id
  from governance.data_contracts
  where dataset_id=v_dataset_id and status='ACTIVE'
  order by updated_at desc
  limit 1;
  if v_contract_id is null then return jsonb_build_object('status','NO_CONTRACT','dataset_id',v_dataset_id); end if;

  v_result := governance.evaluate_data_contract_for_contract(v_contract_id,p_profile_run_id);
  v_status := v_result->>'status';
  v_fingerprint := 'data-contract:'||v_dataset_id::text;

  if v_status='FAILED' then
    insert into profiling.observability_alerts(project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at)
    values(v_project_id,v_dataset_id,v_dataset_version_id,p_profile_run_id,'DATA_CONTRACT','HIGH','Data contract validation failed','One or more active data contract expectations failed on the latest profiling evidence.',v_fingerprint,jsonb_build_object('contract_id',v_contract_id,'evaluation',v_result),'OPEN',now(),now(),now())
    on conflict(project_id,fingerprint) do update set
      dataset_version_id=excluded.dataset_version_id,
      profile_run_id=excluded.profile_run_id,
      severity='HIGH',
      title=excluded.title,
      description=excluded.description,
      evidence=excluded.evidence,
      status='OPEN',
      last_observed_at=now(),
      resolved_at=null,
      updated_at=now();
    perform governance.invalidate_dataset_certification(v_dataset_id,'DATA_CONTRACT_FAILED',jsonb_build_object('profile_run_id',p_profile_run_id,'evaluation',v_result));
  elsif v_status='PASSED' then
    update profiling.observability_alerts
    set status='RESOLVED',resolved_at=now(),updated_at=now()
    where project_id=v_project_id and fingerprint=v_fingerprint and status<>'RESOLVED';
  end if;
  return v_result;
end;
$$;

revoke all on function governance.evaluate_data_contract_for_contract(uuid,uuid) from public,anon,authenticated;
revoke all on function governance.evaluate_data_contract(uuid) from public,anon,authenticated;
grant execute on function governance.evaluate_data_contract_for_contract(uuid,uuid) to service_role;
grant execute on function governance.evaluate_data_contract(uuid) to service_role;
