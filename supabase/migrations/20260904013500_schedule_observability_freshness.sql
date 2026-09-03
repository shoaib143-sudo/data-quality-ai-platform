create extension if not exists pg_cron;

create or replace function profiling.refresh_observability_freshness_alerts()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, profiling, catalog, app
as $function$
declare
  v_now timestamptz := now();
  v_count integer := 0;
begin
  with latest_evidence as (
    select
      d.id as dataset_id,
      d.project_id,
      dv.id as dataset_version_id,
      pr.id as profile_run_id,
      coalesce(pr.completed_at, pr.started_at) as evidence_at,
      row_number() over (
        partition by d.id
        order by coalesce(pr.completed_at, pr.started_at) desc nulls last
      ) as rn
    from catalog.datasets d
    left join catalog.dataset_versions dv on dv.dataset_id = d.id
    left join profiling.profile_runs pr
      on pr.dataset_version_id = dv.id
     and pr.status = 'COMPLETED'
  ),
  stale as (
    select
      d.id as dataset_id,
      d.project_id,
      le.dataset_version_id,
      le.profile_run_id,
      le.evidence_at
    from catalog.datasets d
    left join latest_evidence le on le.dataset_id = d.id and le.rn = 1
    where le.evidence_at is null
       or le.evidence_at < v_now - interval '24 hours'
  )
  insert into profiling.observability_alerts (
    project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,
    title,description,fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at
  )
  select
    s.project_id,
    s.dataset_id,
    s.dataset_version_id,
    s.profile_run_id,
    'FRESHNESS',
    case when s.evidence_at is null or s.evidence_at < v_now - interval '72 hours' then 'HIGH' else 'MEDIUM' end,
    d.name || ' governance evidence is stale',
    case
      when s.evidence_at is null then 'No completed profiling evidence is available for this governed dataset.'
      else 'The latest completed profiling evidence is older than the 24 hour governance freshness threshold.'
    end,
    'freshness:' || s.dataset_id::text,
    jsonb_build_object(
      'latest_profile_run_id', s.profile_run_id,
      'latest_evidence_at', s.evidence_at,
      'freshness_basis', 'completed_profiling_evidence',
      'threshold_hours', 24
    ),
    'OPEN',
    v_now,
    v_now,
    v_now
  from stale s
  join catalog.datasets d on d.id = s.dataset_id
  on conflict (project_id,fingerprint) do update set
    dataset_version_id = excluded.dataset_version_id,
    profile_run_id = excluded.profile_run_id,
    severity = excluded.severity,
    title = excluded.title,
    description = excluded.description,
    evidence = excluded.evidence,
    status = 'OPEN',
    last_observed_at = excluded.last_observed_at,
    resolved_at = null,
    updated_at = excluded.updated_at;

  get diagnostics v_count = row_count;

  update profiling.observability_alerts oa
  set status='RESOLVED',
      resolved_at=v_now,
      updated_at=v_now
  where oa.category='FRESHNESS'
    and oa.status <> 'RESOLVED'
    and exists (
      select 1
      from catalog.dataset_versions dv
      join profiling.profile_runs pr on pr.dataset_version_id=dv.id
      where dv.dataset_id=oa.dataset_id
        and pr.status='COMPLETED'
        and coalesce(pr.completed_at,pr.started_at) >= v_now - interval '24 hours'
    );

  return v_count;
end;
$function$;

revoke execute on function profiling.refresh_observability_freshness_alerts() from public, anon, authenticated;
grant execute on function profiling.refresh_observability_freshness_alerts() to service_role;

select cron.schedule(
  'dgp-observability-freshness',
  '17 * * * *',
  'select profiling.refresh_observability_freshness_alerts();'
)
where not exists (select 1 from cron.job where jobname='dgp-observability-freshness');

select profiling.refresh_observability_freshness_alerts();
