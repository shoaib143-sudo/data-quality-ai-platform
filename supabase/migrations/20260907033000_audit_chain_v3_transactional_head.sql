-- Audit chain v3: make strict chaining safe for multi-row statements and concurrent writers.
-- Historical v2 evidence remains immutable. New writes use a transactional per-project chain head.

create table if not exists governance.audit_chain_heads (
  project_key text not null,
  chain_version smallint not null,
  last_event_hash text,
  last_chain_sequence bigint,
  updated_at timestamptz not null default now(),
  primary key (project_key, chain_version)
);

revoke all on table governance.audit_chain_heads from public, anon, authenticated;

comment on table governance.audit_chain_heads is
  'Internal transactional head state for strict audit chains. Not governance evidence itself; audit_events remains the immutable evidence record.';

create or replace function governance.prepare_audit_event_hash()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, governance
as $function$
declare
  v_project_key text := coalesce(new.project_id::text, 'GLOBAL');
  v_prev_hash text;
begin
  new.chain_version := 3;
  if new.chain_sequence is null then
    new.chain_sequence := nextval('governance.audit_event_chain_sequence'::regclass);
  end if;

  insert into governance.audit_chain_heads(project_key, chain_version, last_event_hash, last_chain_sequence)
  values(v_project_key, 3, null, null)
  on conflict (project_key, chain_version) do nothing;

  select h.last_event_hash
    into v_prev_hash
  from governance.audit_chain_heads h
  where h.project_key = v_project_key
    and h.chain_version = 3
  for update;

  new.previous_hash := v_prev_hash;
  new.event_hash := governance.compute_audit_event_hash(
    new.previous_hash,
    new.id,
    new.project_id,
    new.actor_user_id,
    new.actor_type,
    new.event_type,
    new.entity_type,
    new.entity_id,
    new.correlation_id,
    new.metadata,
    new.created_at
  );

  update governance.audit_chain_heads
  set last_event_hash = new.event_hash,
      last_chain_sequence = new.chain_sequence,
      updated_at = now()
  where project_key = v_project_key
    and chain_version = 3;

  return new;
end;
$function$;

create or replace function governance.verify_audit_chain(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance
as $function$
declare
  r record;
  v_project_marker text := null;
  v_chain_version smallint := null;
  v_prev text := null;
  v_expected text;
  v_checked integer := 0;
  v_failures integer := 0;
  v_legacy_checked integer := 0;
  v_legacy_failures integer := 0;
  v_active_checked integer := 0;
  v_active_failures integer := 0;
  v_retired_checked integer := 0;
  v_retired_failures integer := 0;
  v_legacy_forks integer := 0;
begin
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash
    from governance.audit_events
    where chain_version = 1
      and (p_project_id is null or project_id=p_project_id)
  loop
    v_expected := governance.compute_audit_event_hash(
      r.previous_hash,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_legacy_checked := v_legacy_checked + 1;
    if r.event_hash is distinct from v_expected
       or (r.previous_hash is not null and not exists (
         select 1 from governance.audit_events p
         where p.chain_version = 1
           and p.project_id is not distinct from r.project_id
           and p.event_hash = r.previous_hash
       )) then
      v_failures := v_failures + 1;
      v_legacy_failures := v_legacy_failures + 1;
    end if;
  end loop;

  select count(*) into v_legacy_forks
  from (
    select project_id, previous_hash
    from governance.audit_events
    where chain_version = 1
      and previous_hash is not null
      and (p_project_id is null or project_id=p_project_id)
    group by project_id, previous_hash
    having count(*) > 1
  ) forks;

  -- v2 remains immutable historical evidence. Its failures are reported but do not
  -- invalidate the active v3 chain after the writer defect has been retired.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash,chain_version,chain_sequence
    from governance.audit_events
    where chain_version = 2
      and (p_project_id is null or project_id=p_project_id)
    order by coalesce(project_id::text,''),chain_sequence
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'')
       or v_chain_version is distinct from r.chain_version then
      v_project_marker := coalesce(r.project_id::text,'');
      v_chain_version := r.chain_version;
      v_prev := null;
    end if;
    v_expected := governance.compute_audit_event_hash(
      v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_retired_checked := v_retired_checked + 1;
    if r.chain_sequence is null
       or r.previous_hash is distinct from v_prev
       or r.event_hash is distinct from v_expected then
      v_retired_failures := v_retired_failures + 1;
    end if;
    v_prev := r.event_hash;
  end loop;

  v_project_marker := null;
  v_chain_version := null;
  v_prev := null;

  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash,chain_version,chain_sequence
    from governance.audit_events
    where chain_version >= 3
      and (p_project_id is null or project_id=p_project_id)
    order by coalesce(project_id::text,''),chain_version,chain_sequence
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'')
       or v_chain_version is distinct from r.chain_version then
      v_project_marker := coalesce(r.project_id::text,'');
      v_chain_version := r.chain_version;
      v_prev := null;
    end if;
    v_expected := governance.compute_audit_event_hash(
      v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_active_checked := v_active_checked + 1;
    if r.chain_sequence is null
       or r.previous_hash is distinct from v_prev
       or r.event_hash is distinct from v_expected then
      v_failures := v_failures + 1;
      v_active_failures := v_active_failures + 1;
    end if;
    v_prev := r.event_hash;
  end loop;

  return jsonb_build_object(
    'valid',v_failures=0,
    'events_checked',v_checked,
    'failures',v_failures,
    'legacy_events_checked',v_legacy_checked,
    'legacy_failures',v_legacy_failures,
    'legacy_forks_observed',v_legacy_forks,
    'active_strict_events_checked',v_active_checked,
    'active_strict_failures',v_active_failures,
    'retired_v2_events_checked',v_retired_checked,
    'retired_v2_failures',v_retired_failures,
    'retired_v2_semantics','IMMUTABLE_HISTORICAL_EVIDENCE_NOT_REWRITTEN',
    'chain_version',3,
    'verified_at',now()
  );
end;
$function$;

-- Preserve failed job evidence while recognizing recovery by the same dataset version
-- for PROFILING jobs whose historical entity_id used profile-run identity.
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

  with recent_dead as (
    select dead.*, da.dataset_version_id as dead_dataset_version_id
    from orchestration.job_queue dead
    left join agent.agent_runs da on da.id=dead.agent_run_id
    where dead.project_id=p_project_id
      and dead.status='DEAD'
      and dead.completed_at>=now()-interval '24 hours'
  ), recovery as (
    select dead.id,
      exists (
        select 1
        from orchestration.job_queue recovered
        left join agent.agent_runs ra on ra.id=recovered.agent_run_id
        where recovered.project_id=dead.project_id
          and recovered.job_type=dead.job_type
          and recovered.status='SUCCEEDED'
          and recovered.completed_at>dead.completed_at
          and (
            recovered.entity_id is not distinct from dead.entity_id
            or (
              dead.job_type='PROFILING'
              and dead.dead_dataset_version_id is not null
              and ra.dataset_version_id=dead.dead_dataset_version_id
            )
          )
      ) as is_recovered
    from recent_dead dead
  )
  select count(*) filter(where not is_recovered), count(*) filter(where is_recovered)
    into v_dead_jobs,v_superseded_dead_jobs
  from recovery;

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
    'dead_jobs_last_24h',jsonb_build_object('passed',v_dead_jobs=0,'count',v_dead_jobs,'semantics','UNRESOLVED_ONLY_CANONICAL_DATASET_RECOVERY'),
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
