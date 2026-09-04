create unique index if not exists profile_anomalies_quality_intelligence_uq
on profiling.profile_anomalies (
  profile_run_id,
  coalesce(profile_column_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(metric_key, ''),
  anomaly_type,
  detected_by
);

create unique index if not exists quality_rule_runs_system_profile_uq
on profiling.quality_rule_runs (rule_definition_id, profile_run_id)
where agent_run_id is null and profile_run_id is not null;

create or replace function profiling.evaluate_profile_quality_intelligence(p_profile_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = profiling, catalog, governance, public
as $$
declare
  v_dataset_version_id uuid;
  v_dataset_id uuid;
  v_project_id uuid;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_baseline_run_id uuid;
  v_metrics_changed integer := 0;
  v_anomalies_found integer := 0;
  v_rules_evaluated integer := 0;
  v_rules_failed integer := 0;
  v_high_rules_failed integer := 0;
  v_changes jsonb := '[]'::jsonb;
  v_rule record;
  v_observed numeric;
  v_passed boolean;
  v_existing_run_id uuid;
  v_now timestamptz := now();
begin
  select pr.dataset_version_id, dv.dataset_id, d.project_id, pr.started_at, pr.completed_at
    into v_dataset_version_id, v_dataset_id, v_project_id, v_started_at, v_completed_at
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
  join catalog.datasets d on d.id = dv.dataset_id
  where pr.id = p_profile_run_id
    and pr.status = 'COMPLETED';

  if v_dataset_id is null then
    raise exception 'Completed profile run % was not found', p_profile_run_id;
  end if;

  for v_rule in
    select q.*
    from profiling.quality_rule_definitions q
    where q.project_id = v_project_id
      and q.dataset_id = v_dataset_id
      and q.enabled = true
      and coalesce(q.rule_type, 'METRIC_THRESHOLD') = 'METRIC_THRESHOLD'
      and (q.dataset_version_id is null or q.dataset_version_id = v_dataset_version_id)
    order by q.rule_key, q.column_name nulls first
  loop
    v_rules_evaluated := v_rules_evaluated + 1;
    v_observed := null;

    select pm.numeric_value
      into v_observed
    from profiling.profile_metrics pm
    left join profiling.profile_columns pc on pc.id = pm.profile_column_id
    where pm.profile_run_id = p_profile_run_id
      and pm.metric_key = v_rule.metric_key
      and (
        (v_rule.column_name is null and pm.profile_column_id is null)
        or
        (v_rule.column_name is not null and pc.column_name = v_rule.column_name)
      )
    limit 1;

    if v_observed is null then
      v_passed := null;
    else
      v_passed := case v_rule.operator
        when 'LTE' then v_observed <= v_rule.threshold
        when 'GTE' then v_observed >= v_rule.threshold
        when 'EQ' then v_observed = v_rule.threshold
        when 'NEQ' then v_observed <> v_rule.threshold
        else null
      end;
    end if;

    select qrr.id into v_existing_run_id
    from profiling.quality_rule_runs qrr
    where qrr.rule_definition_id = v_rule.id
      and qrr.profile_run_id = p_profile_run_id
      and qrr.agent_run_id is null
    limit 1;

    if v_existing_run_id is null then
      insert into profiling.quality_rule_runs (
        rule_definition_id, agent_run_id, dataset_version_id, profile_run_id,
        status, passed, observed_value, threshold, evidence, error_message,
        started_at, completed_at
      ) values (
        v_rule.id, null, v_dataset_version_id, p_profile_run_id,
        case when v_observed is null then 'ERROR' when v_passed then 'PASSED' else 'FAILED' end,
        v_passed, v_observed, v_rule.threshold,
        jsonb_build_object(
          'evaluation_engine', 'quality_intelligence_sql_v1',
          'metric_key', v_rule.metric_key,
          'column_name', v_rule.column_name,
          'operator', v_rule.operator,
          'metric_available', v_observed is not null,
          'source_profile_run_id', p_profile_run_id
        ),
        case when v_observed is null then 'Required metric evidence is unavailable for this completed profile.' else null end,
        v_now, v_now
      );
    else
      update profiling.quality_rule_runs
      set dataset_version_id = v_dataset_version_id,
          status = case when v_observed is null then 'ERROR' when v_passed then 'PASSED' else 'FAILED' end,
          passed = v_passed,
          observed_value = v_observed,
          threshold = v_rule.threshold,
          evidence = jsonb_build_object(
            'evaluation_engine', 'quality_intelligence_sql_v1',
            'metric_key', v_rule.metric_key,
            'column_name', v_rule.column_name,
            'operator', v_rule.operator,
            'metric_available', v_observed is not null,
            'source_profile_run_id', p_profile_run_id
          ),
          error_message = case when v_observed is null then 'Required metric evidence is unavailable for this completed profile.' else null end,
          completed_at = v_now
      where id = v_existing_run_id;
    end if;
  end loop;

  select count(*)::int,
         count(*) filter (where upper(coalesce(q.severity,'')) in ('HIGH','CRITICAL'))::int
    into v_rules_failed, v_high_rules_failed
  from profiling.quality_rule_runs qrr
  join profiling.quality_rule_definitions q on q.id = qrr.rule_definition_id
  where qrr.profile_run_id = p_profile_run_id
    and qrr.agent_run_id is null
    and qrr.status = 'FAILED';

  if v_rules_failed > 0 then
    insert into profiling.observability_alerts (
      project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,
      fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at
    ) values (
      v_project_id,v_dataset_id,v_dataset_version_id,p_profile_run_id,'QUALITY_RULE_FAILURE',
      case when v_high_rules_failed > 0 then 'HIGH' else 'MEDIUM' end,
      'Automated data quality controls are failing',
      format('%s metric-backed quality control(s) failed on the latest completed profile.', v_rules_failed),
      'quality-rule-failure:' || v_dataset_id::text,
      jsonb_build_object('profile_run_id',p_profile_run_id,'failed_rule_count',v_rules_failed,'high_or_critical_rule_count',v_high_rules_failed,'evaluation_engine','quality_intelligence_sql_v1'),
      'OPEN',v_now,v_now,v_now
    )
    on conflict (project_id,fingerprint) do update
      set dataset_version_id=excluded.dataset_version_id,
          profile_run_id=excluded.profile_run_id,
          severity=excluded.severity,
          title=excluded.title,
          description=excluded.description,
          evidence=excluded.evidence,
          status='OPEN',
          last_observed_at=excluded.last_observed_at,
          resolved_at=null,
          updated_at=excluded.updated_at;
  else
    update profiling.observability_alerts
       set status='RESOLVED', resolved_at=v_now, updated_at=v_now
     where project_id=v_project_id
       and fingerprint='quality-rule-failure:' || v_dataset_id::text
       and status <> 'RESOLVED';
  end if;

  select pr.id into v_baseline_run_id
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
  where dv.dataset_id = v_dataset_id
    and pr.status = 'COMPLETED'
    and pr.id <> p_profile_run_id
    and coalesce(pr.completed_at, pr.started_at) < coalesce(v_completed_at, v_started_at, v_now)
  order by coalesce(pr.completed_at, pr.started_at) desc
  limit 1;

  if v_baseline_run_id is not null then
    with current_metrics as (
      select pm.profile_column_id, pc.column_name, pm.metric_definition_id, pm.metric_key, pm.numeric_value
      from profiling.profile_metrics pm
      left join profiling.profile_columns pc on pc.id = pm.profile_column_id
      where pm.profile_run_id = p_profile_run_id
        and pm.numeric_value is not null
    ), baseline_metrics as (
      select pc.column_name, pm.metric_key, pm.numeric_value
      from profiling.profile_metrics pm
      left join profiling.profile_columns pc on pc.id = pm.profile_column_id
      where pm.profile_run_id = v_baseline_run_id
        and pm.numeric_value is not null
    ), changed as (
      select cm.profile_column_id, cm.column_name, cm.metric_definition_id, cm.metric_key,
             cm.numeric_value as current_value, bm.numeric_value as baseline_value,
             cm.numeric_value - bm.numeric_value as absolute_change,
             case when bm.numeric_value = 0 then null else (cm.numeric_value - bm.numeric_value) / abs(bm.numeric_value) end as relative_change
      from current_metrics cm
      join baseline_metrics bm
        on bm.metric_key = cm.metric_key
       and coalesce(bm.column_name,'__DATASET__') = coalesce(cm.column_name,'__DATASET__')
      where abs(cm.numeric_value - bm.numeric_value) > 0.000000001
    )
    select count(*)::int,
           coalesce((select jsonb_agg(jsonb_build_object(
             'column_name',x.column_name,
             'metric_key',x.metric_key,
             'current_value',x.current_value,
             'baseline_value',x.baseline_value,
             'absolute_change',x.absolute_change,
             'relative_change',x.relative_change
           ) order by abs(x.absolute_change) desc)
           from (select * from changed order by abs(absolute_change) desc limit 100) x), '[]'::jsonb)
      into v_metrics_changed, v_changes
    from changed;

    delete from profiling.profile_anomalies
    where profile_run_id = p_profile_run_id
      and detected_by = 'quality_intelligence_engine';

    with current_metrics as (
      select pm.profile_column_id, pc.column_name, pm.metric_definition_id, pm.metric_key, pm.numeric_value
      from profiling.profile_metrics pm
      left join profiling.profile_columns pc on pc.id = pm.profile_column_id
      where pm.profile_run_id = p_profile_run_id
        and pm.numeric_value is not null
    ), baseline_metrics as (
      select pc.column_name, pm.metric_key, pm.numeric_value
      from profiling.profile_metrics pm
      left join profiling.profile_columns pc on pc.id = pm.profile_column_id
      where pm.profile_run_id = v_baseline_run_id
        and pm.numeric_value is not null
    ), candidates as (
      select cm.profile_column_id, cm.column_name, cm.metric_definition_id, cm.metric_key,
             cm.numeric_value as current_value, bm.numeric_value as baseline_value,
             cm.numeric_value - bm.numeric_value as absolute_change,
             case when bm.numeric_value = 0 then null else (cm.numeric_value - bm.numeric_value) / abs(bm.numeric_value) end as relative_change
      from current_metrics cm
      join baseline_metrics bm
        on bm.metric_key = cm.metric_key
       and coalesce(bm.column_name,'__DATASET__') = coalesce(cm.column_name,'__DATASET__')
      where (
        cm.metric_key = 'row_count'
        and bm.numeric_value > 0
        and abs((cm.numeric_value - bm.numeric_value) / bm.numeric_value) >= 0.50
      ) or (
        cm.metric_key in ('null_rate','unique_rate','distinct_rate','pattern_match_rate','sensitive_match_rate','outlier_rate','duplicate_row_rate')
        and abs(cm.numeric_value - bm.numeric_value) >= 0.10
      )
    )
    insert into profiling.profile_anomalies (
      profile_run_id,profile_column_id,metric_definition_id,anomaly_type,severity,metric_key,
      current_value,baseline_value,absolute_change,relative_change,direction,title,description,evidence,detected_by
    )
    select p_profile_run_id,
           c.profile_column_id,
           c.metric_definition_id,
           case when c.metric_key='row_count' then 'VOLUME_DRIFT' else 'METRIC_DRIFT' end,
           case
             when c.metric_key='row_count' and abs(coalesce(c.relative_change,0)) >= 1.0 then 'HIGH'
             when c.metric_key<>'row_count' and abs(c.absolute_change) >= 0.25 then 'HIGH'
             else 'MEDIUM'
           end,
           c.metric_key,
           c.current_value,
           c.baseline_value,
           c.absolute_change,
           case when c.relative_change is null then null else greatest(-1::numeric,c.relative_change) end,
           case when c.current_value > c.baseline_value then 'INCREASE' when c.current_value < c.baseline_value then 'DECREASE' else 'CHANGED' end,
           coalesce(c.column_name || ' ', '') || c.metric_key || ' drift detected',
           format('Metric %s%s changed from %s to %s compared with the previous completed profile.', c.metric_key, case when c.column_name is null then '' else ' on ' || c.column_name end, c.baseline_value, c.current_value),
           jsonb_build_object(
             'baseline_profile_run_id',v_baseline_run_id,
             'current_profile_run_id',p_profile_run_id,
             'column_name',c.column_name,
             'metric_key',c.metric_key,
             'detector','deterministic_previous_profile_threshold_v1',
             'rate_absolute_change_threshold',0.10,
             'row_count_relative_change_threshold',0.50
           ),
           'quality_intelligence_engine'
    from candidates c
    on conflict do nothing;

    get diagnostics v_anomalies_found = row_count;

    insert into profiling.profile_comparisons (
      current_profile_run_id,baseline_profile_run_id,comparison_type,status,summary,changes,metrics_changed,anomalies_found,created_at
    ) values (
      p_profile_run_id,v_baseline_run_id,'PREVIOUS_RUN','COMPLETED',
      format('%s numeric metric(s) changed; %s deterministic anomaly signal(s) exceeded configured thresholds.',v_metrics_changed,v_anomalies_found),
      jsonb_build_object('metrics',v_changes,'detector','quality_intelligence_sql_v1'),
      v_metrics_changed,v_anomalies_found,v_now
    )
    on conflict (current_profile_run_id,baseline_profile_run_id,comparison_type) do update
      set status='COMPLETED',summary=excluded.summary,changes=excluded.changes,
          metrics_changed=excluded.metrics_changed,anomalies_found=excluded.anomalies_found;
  end if;

  return jsonb_build_object(
    'profile_run_id',p_profile_run_id,
    'dataset_id',v_dataset_id,
    'baseline_profile_run_id',v_baseline_run_id,
    'rules_evaluated',v_rules_evaluated,
    'rules_failed',v_rules_failed,
    'metrics_changed',v_metrics_changed,
    'anomalies_found',v_anomalies_found
  );
end;
$$;

revoke all on function profiling.evaluate_profile_quality_intelligence(uuid) from public, anon, authenticated;
grant execute on function profiling.evaluate_profile_quality_intelligence(uuid) to service_role;

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
          else format('The latest completed profiling observation is %.2s hours old versus a governed %.2s hour SLA.',round(v_age_hours,2),round(v_sla_hours,2))
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

create or replace function profiling.refresh_quality_intelligence(p_project_id uuid default null, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = profiling, catalog, public
as $$
declare
  v_run record;
  v_processed integer := 0;
  v_errors integer := 0;
begin
  for v_run in
    select pr.id
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    join catalog.datasets d on d.id=dv.dataset_id
    where pr.status='COMPLETED'
      and (p_project_id is null or d.project_id=p_project_id)
    order by coalesce(pr.completed_at,pr.started_at) desc
    limit greatest(1,least(coalesce(p_limit,100),1000))
  loop
    begin
      perform profiling.evaluate_profile_quality_intelligence(v_run.id);
      v_processed := v_processed + 1;
    exception when others then
      v_errors := v_errors + 1;
      raise warning 'Quality intelligence refresh failed for profile run %: %', v_run.id, sqlerrm;
    end;
  end loop;

  perform profiling.evaluate_freshness_intelligence(p_project_id);
  return jsonb_build_object('processed_profile_runs',v_processed,'errors',v_errors,'project_id',p_project_id);
end;
$$;

revoke all on function profiling.refresh_quality_intelligence(uuid,integer) from public, anon, authenticated;
grant execute on function profiling.refresh_quality_intelligence(uuid,integer) to service_role;

create or replace function profiling.on_profile_completed_quality_intelligence()
returns trigger
language plpgsql
security definer
set search_path = profiling, public
as $$
begin
  if new.status='COMPLETED' and (tg_op='INSERT' or old.status is distinct from new.status) then
    begin
      perform profiling.evaluate_profile_quality_intelligence(new.id);
    exception when others then
      raise warning 'Post-profile quality intelligence failed for %: %',new.id,sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_completed_quality_intelligence on profiling.profile_runs;
create trigger trg_profile_completed_quality_intelligence
after insert or update of status on profiling.profile_runs
for each row execute function profiling.on_profile_completed_quality_intelligence();

do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='dgp-quality-intelligence-refresh';
    perform cron.schedule('dgp-quality-intelligence-refresh','*/15 * * * *',$job$select profiling.refresh_quality_intelligence(null,200);$job$);
  end if;
exception when others then
  raise warning 'Unable to schedule quality intelligence refresh: %',sqlerrm;
end;
$$;