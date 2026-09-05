create or replace function governance.run_platform_contract_checks(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance', 'profiling', 'catalog', 'agent', 'orchestration', 'app'
as $function$
declare
  v_exists boolean;
  v_audit jsonb;
  v_duplicate_sources integer:=0;
  v_missing_execution_sources integer:=0;
  v_missing_scores integer:=0;
  v_missing_investigations integer:=0;
  v_invalid_contract_versions integer:=0;
  v_stale_agent_runs integer:=0;
  v_stale_profile_runs integer:=0;
  v_dead_jobs integer:=0;
  v_superseded_dead_jobs integer:=0;
  v_dead_events integer:=0;
  v_failure_count integer:=0;
  v_checks jsonb;
  v_status text;
  v_run_id uuid;
begin
  select exists(select 1 from app.projects where id=p_project_id) into v_exists;
  if not v_exists then raise exception 'Project not found'; end if;

  v_audit:=governance.verify_audit_chain(p_project_id);

  select count(*) into v_duplicate_sources
  from (
    select des.dataset_version_id
    from profiling.dataset_execution_sources des
    join catalog.dataset_versions dv on dv.id=des.dataset_version_id
    join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and des.active=true
    group by des.dataset_version_id
    having count(*)>1
  ) x;

  select count(*) into v_missing_execution_sources
  from catalog.datasets d
  join lateral (
    select dv.id,dv.status from catalog.dataset_versions dv where dv.dataset_id=d.id order by dv.version_number desc limit 1
  ) latest on true
  where d.project_id=p_project_id
    and latest.status='AVAILABLE'
    and not exists(select 1 from profiling.dataset_execution_sources des where des.dataset_version_id=latest.id and des.active=true);

  with latest as (
    select distinct on (dv.dataset_id) pr.id,pr.summary
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and pr.status='COMPLETED'
    order by dv.dataset_id,pr.completed_at desc nulls last,pr.started_at desc
  )
  select count(*) filter(where not exists(select 1 from profiling.data_quality_scores s where s.profile_run_id=latest.id)),
         count(*) filter(where not (coalesce(latest.summary,'{}'::jsonb) ? 'investigation'))
  into v_missing_scores,v_missing_investigations
  from latest;

  select count(*) into v_invalid_contract_versions
  from governance.data_contracts c
  where c.project_id=p_project_id and c.status='ACTIVE'
    and 1<>(select count(*) from governance.data_contract_versions cv where cv.contract_id=c.id and cv.status='ACTIVE');

  select count(*) into v_stale_agent_runs
  from agent.agent_runs ar
  where ar.project_id=p_project_id
    and ar.status in ('CREATED','QUEUED','RUNNING','WAITING')
    and coalesce(ar.started_at,ar.created_at)<now()-interval '30 minutes'
    and not exists(select 1 from orchestration.job_queue q where q.agent_run_id=ar.id and q.status in ('QUEUED','RUNNING'));

  select count(*) into v_stale_profile_runs
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
  join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id and pr.status='RUNNING' and pr.started_at<now()-interval '30 minutes'
    and not exists(select 1 from orchestration.job_queue q where q.agent_run_id=pr.agent_run_id and q.status in ('QUEUED','RUNNING'));

  select count(*) into v_dead_jobs
  from orchestration.job_queue dead
  where dead.project_id=p_project_id
    and dead.status='DEAD'
    and dead.completed_at>=now()-interval '24 hours'
    and not exists (
      select 1
      from orchestration.job_queue recovered
      where recovered.project_id=dead.project_id
        and recovered.job_type=dead.job_type
        and recovered.entity_id is not distinct from dead.entity_id
        and recovered.status='SUCCEEDED'
        and recovered.completed_at>dead.completed_at
    );

  select count(*) into v_superseded_dead_jobs
  from orchestration.job_queue dead
  where dead.project_id=p_project_id
    and dead.status='DEAD'
    and dead.completed_at>=now()-interval '24 hours'
    and exists (
      select 1
      from orchestration.job_queue recovered
      where recovered.project_id=dead.project_id
        and recovered.job_type=dead.job_type
        and recovered.entity_id is not distinct from dead.entity_id
        and recovered.status='SUCCEEDED'
        and recovered.completed_at>dead.completed_at
    );

  select count(*) into v_dead_events from orchestration.event_outbox
  where project_id=p_project_id and status='DEAD' and processed_at>=now()-interval '24 hours';

  v_failure_count :=
    case when coalesce((v_audit->>'valid')::boolean,false) then 0 else 1 end
    +v_duplicate_sources+v_missing_execution_sources+v_missing_scores+v_missing_investigations
    +v_invalid_contract_versions+v_stale_agent_runs+v_stale_profile_runs+v_dead_jobs+v_dead_events;

  v_checks:=jsonb_build_object(
    'audit_chain',v_audit,
    'duplicate_active_execution_sources',jsonb_build_object('passed',v_duplicate_sources=0,'count',v_duplicate_sources),
    'available_datasets_missing_execution_source',jsonb_build_object('passed',v_missing_execution_sources=0,'count',v_missing_execution_sources),
    'latest_completed_profiles_missing_score',jsonb_build_object('passed',v_missing_scores=0,'count',v_missing_scores),
    'latest_completed_profiles_missing_investigation',jsonb_build_object('passed',v_missing_investigations=0,'count',v_missing_investigations),
    'active_contracts_without_exactly_one_active_version',jsonb_build_object('passed',v_invalid_contract_versions=0,'count',v_invalid_contract_versions),
    'stale_agent_runs_without_active_job',jsonb_build_object('passed',v_stale_agent_runs=0,'count',v_stale_agent_runs),
    'stale_profile_runs_without_active_job',jsonb_build_object('passed',v_stale_profile_runs=0,'count',v_stale_profile_runs),
    'dead_jobs_last_24h',jsonb_build_object('passed',v_dead_jobs=0,'count',v_dead_jobs,'semantics','UNRESOLVED_ONLY'),
    'superseded_dead_jobs_last_24h',jsonb_build_object('passed',true,'count',v_superseded_dead_jobs,'semantics','PRESERVED_AUDIT_HISTORY'),
    'dead_events_last_24h',jsonb_build_object('passed',v_dead_events=0,'count',v_dead_events)
  );
  v_status:=case when v_failure_count=0 then 'PASSED' else 'FAILED' end;

  insert into governance.platform_contract_check_runs(project_id,status,failure_count,checks,started_at,completed_at)
  values(p_project_id,v_status,v_failure_count,v_checks,now(),now()) returning id into v_run_id;

  insert into orchestration.platform_telemetry(project_id,metric_key,numeric_value,dimensions)
  values(p_project_id,'platform.contract_failures',v_failure_count,jsonb_build_object('status',v_status,'check_run_id',v_run_id));

  return jsonb_build_object('id',v_run_id,'project_id',p_project_id,'status',v_status,'failure_count',v_failure_count,'checks',v_checks);
end;
$function$;
