create or replace function profiling.evaluate_freshness_intelligence(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = profiling, catalog, governance, public
as $$
declare
  v_dataset record;
  v_latest_run_id uuid;
  v_latest_completed_at timestamptz;
  v_sla_hours numeric;
  v_age_hours numeric;
  v_now timestamptz := now();
  v_opened integer := 0;
  v_resolved integer := 0;
begin
  for v_dataset in
    select d.id,d.project_id,d.name
    from catalog.datasets d
    where p_project_id is null or d.project_id = p_project_id
  loop
    select coalesce(op.freshness_sla_hours, dcv.freshness_sla_hours)
      into v_sla_hours
    from (select 1) s
    left join profiling.observability_policies op
      on op.dataset_id = v_dataset.id and op.enabled = true
    left join governance.data_contracts dc
      on dc.dataset_id = v_dataset.id and dc.status = 'ACTIVE'
    left join governance.data_contract_versions dcv
      on dcv.contract_id = dc.id and dcv.version_number = dc.current_version
    limit 1;

    if v_sla_hours is null or v_sla_hours <= 0 then
      continue;
    end if;

    select pr.id, pr.completed_at
      into v_latest_run_id, v_latest_completed_at
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
    where dv.dataset_id = v_dataset.id
      and pr.status = 'COMPLETED'
      and pr.completed_at is not null
    order by pr.completed_at desc
    limit 1;

    if v_latest_completed_at is null then
      v_age_hours := null;
    else
      v_age_hours := extract(epoch from (v_now - v_latest_completed_at)) / 3600.0;
    end if;

    if v_latest_completed_at is null or v_age_hours > v_sla_hours then
      insert into profiling.observability_alerts (
        project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,
        fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at
      ) values (
        v_dataset.project_id,v_dataset.id,null,v_latest_run_id,'FRESHNESS',
        case
          when v_latest_completed_at is null then 'HIGH'
          when v_age_hours >= v_sla_hours * 4 then 'CRITICAL'
          when v_age_hours >= v_sla_hours * 2 then 'HIGH'
          else 'MEDIUM'
        end,
        v_dataset.name || ' freshness SLA is at risk',
        case when v_latest_completed_at is null
          then 'No completed profiling observation exists for a dataset with a governed freshness SLA.'
          else format('The latest completed profiling observation is %s hours old versus a governed %s hour SLA.',round(v_age_hours,2),round(v_sla_hours,2))
        end,
        'freshness:' || v_dataset.id::text,
        jsonb_build_object(
          'signal_type','PROFILE_OBSERVATION_FRESHNESS',
          'latest_profile_run_id',v_latest_run_id,
          'latest_completed_at',v_latest_completed_at,
          'observed_age_hours',v_age_hours,
          'freshness_sla_hours',v_sla_hours,
          'limitation','This signal uses the latest completed profiling observation as a freshness proxy until source-native watermark telemetry is available.'
        ),
        'OPEN',v_now,v_now,v_now
      )
      on conflict (project_id,fingerprint) do update
        set profile_run_id=excluded.profile_run_id,
            category='FRESHNESS',severity=excluded.severity,title=excluded.title,description=excluded.description,
            evidence=excluded.evidence,status='OPEN',last_observed_at=v_now,resolved_at=null,updated_at=v_now;
      v_opened := v_opened + 1;
    else
      update profiling.observability_alerts
         set status='RESOLVED',resolved_at=v_now,updated_at=v_now,last_observed_at=v_now,
             evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object('observed_age_hours',v_age_hours,'freshness_sla_hours',v_sla_hours,'resolved_by','quality_intelligence_freshness_v1')
       where project_id=v_dataset.project_id
         and fingerprint='freshness:' || v_dataset.id::text
         and status <> 'RESOLVED';
      if found then v_resolved := v_resolved + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('opened_or_refreshed',v_opened,'resolved',v_resolved,'evaluated_at',v_now);
end;
$$;

revoke all on function profiling.evaluate_freshness_intelligence(uuid) from public, anon, authenticated;
grant execute on function profiling.evaluate_freshness_intelligence(uuid) to service_role;