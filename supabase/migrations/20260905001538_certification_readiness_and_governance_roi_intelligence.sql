create table if not exists governance.certification_readiness (
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  readiness_score numeric not null check (readiness_score between 0 and 1),
  readiness_status text not null check (readiness_status in ('READY','CONDITIONAL','NOT_READY')),
  blockers jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  assessed_at timestamptz not null default now(),
  primary key (project_id,dataset_id)
);

create index if not exists certification_readiness_status_idx on governance.certification_readiness(project_id,readiness_status,readiness_score);
alter table governance.certification_readiness enable row level security;
drop policy if exists certification_readiness_project_read on governance.certification_readiness;
create policy certification_readiness_project_read on governance.certification_readiness for select to authenticated using (app_private.is_project_member(project_id));
revoke all on governance.certification_readiness from anon;
grant select on governance.certification_readiness to authenticated;
grant all on governance.certification_readiness to service_role;

create table if not exists governance.governance_roi_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references app.projects(id) on delete cascade,
  value_score numeric check (value_score is null or value_score between 0 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  metrics jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);

alter table governance.governance_roi_snapshots enable row level security;
drop policy if exists governance_roi_snapshots_project_read on governance.governance_roi_snapshots;
create policy governance_roi_snapshots_project_read on governance.governance_roi_snapshots for select to authenticated using (app_private.is_project_member(project_id));
revoke all on governance.governance_roi_snapshots from anon;
grant select on governance.governance_roi_snapshots to authenticated;
grant all on governance.governance_roi_snapshots to service_role;

create or replace function governance.refresh_certification_readiness(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog
as $$
declare
  d record;
  v_owner boolean;
  v_steward boolean;
  v_pending_classifications integer;
  v_pending_cdes integer;
  v_active_contract boolean;
  v_contract_status text;
  v_latest_quality numeric;
  v_high_open integer;
  v_current_cert text;
  v_score numeric;
  v_status text;
  v_blockers jsonb;
  v_count integer := 0;
begin
  for d in select id,business_domain from catalog.datasets where project_id=p_project_id and status='ACTIVE' loop
    select exists(
      select 1 from governance.accountability_assignments a
      where a.project_id=p_project_id and a.status='ACTIVE' and a.assignment_type in ('BUSINESS_OWNER','TECHNICAL_OWNER')
        and ((a.scope_type='DATASET' and a.scope_key=d.id::text) or (a.scope_type='DOMAIN' and a.scope_key=coalesce(d.business_domain,'')))
    ) into v_owner;

    select exists(
      select 1 from governance.accountability_assignments a
      where a.project_id=p_project_id and a.status='ACTIVE' and a.assignment_type='DATA_STEWARD'
        and a.scope_type='DATASET' and a.scope_key=d.id::text
    ) into v_steward;

    select count(*) into v_pending_classifications from governance.dataset_classifications c
    where c.project_id=p_project_id and c.dataset_id=d.id and c.status='SUGGESTED';

    select count(*) into v_pending_cdes from governance.cde_mappings m
    where m.project_id=p_project_id and m.dataset_id=d.id and m.status='SUGGESTED';

    select exists(select 1 from governance.data_contracts c where c.project_id=p_project_id and c.dataset_id=d.id and c.status='ACTIVE') into v_active_contract;
    select e.status into v_contract_status from governance.data_contract_evaluations e
    where e.project_id=p_project_id and e.dataset_id=d.id order by e.evaluated_at desc limit 1;

    select s.overall_score into v_latest_quality
    from catalog.dataset_versions dv
    join profiling.profile_runs pr on pr.dataset_version_id=dv.id and pr.status='COMPLETED'
    join profiling.data_quality_scores s on s.profile_run_id=pr.id
    where dv.dataset_id=d.id order by pr.completed_at desc nulls last,pr.started_at desc limit 1;

    select count(*) into v_high_open from (
      select 1 from governance.issues i where i.project_id=p_project_id and i.dataset_id=d.id and i.status not in ('RESOLVED','CLOSED','DONE','CANCELLED') and i.severity in ('HIGH','CRITICAL')
      union all
      select 1 from governance.observability_incidents oi where oi.project_id=p_project_id and oi.dataset_id=d.id and oi.status not in ('RESOLVED','CLOSED','DONE','CANCELLED') and oi.severity in ('HIGH','CRITICAL','SEV1','SEV2')
    ) x;

    select dc.certification_status into v_current_cert from governance.dataset_certifications dc
    where dc.project_id=p_project_id and dc.dataset_id=d.id order by dc.updated_at desc limit 1;

    v_score := (
      (case when v_owner then 1 else 0 end) +
      (case when v_steward then 1 else 0 end) +
      (case when v_pending_classifications=0 then 1 else 0 end) +
      (case when v_pending_cdes=0 then 1 else 0 end) +
      (case when v_active_contract and v_contract_status='PASSED' then 1 else 0 end) +
      (case when v_latest_quality is not null and v_latest_quality>=0.90 then 1 else 0 end) +
      (case when v_high_open=0 then 1 else 0 end)
    )::numeric / 7;
    v_score := round(v_score,4);
    v_status := case when v_score>=0.85 then 'READY' when v_score>=0.60 then 'CONDITIONAL' else 'NOT_READY' end;

    v_blockers := '[]'::jsonb;
    if not v_owner then v_blockers:=v_blockers||jsonb_build_array('MISSING_OWNER'); end if;
    if not v_steward then v_blockers:=v_blockers||jsonb_build_array('MISSING_STEWARD'); end if;
    if v_pending_classifications>0 then v_blockers:=v_blockers||jsonb_build_array('PENDING_CLASSIFICATION_APPROVALS'); end if;
    if v_pending_cdes>0 then v_blockers:=v_blockers||jsonb_build_array('PENDING_CDE_APPROVALS'); end if;
    if not v_active_contract then v_blockers:=v_blockers||jsonb_build_array('MISSING_ACTIVE_CONTRACT');
    elsif v_contract_status is distinct from 'PASSED' then v_blockers:=v_blockers||jsonb_build_array('CONTRACT_NOT_PASSED'); end if;
    if v_latest_quality is null then v_blockers:=v_blockers||jsonb_build_array('QUALITY_NOT_ASSESSED');
    elsif v_latest_quality<0.90 then v_blockers:=v_blockers||jsonb_build_array('QUALITY_BELOW_90_PERCENT'); end if;
    if v_high_open>0 then v_blockers:=v_blockers||jsonb_build_array('OPEN_HIGH_SEVERITY_RISK'); end if;

    insert into governance.certification_readiness(project_id,dataset_id,readiness_score,readiness_status,blockers,evidence,assessed_at)
    values(p_project_id,d.id,v_score,v_status,v_blockers,jsonb_build_object(
      'owner_present',v_owner,'steward_present',v_steward,
      'pending_classification_approvals',v_pending_classifications,
      'pending_cde_approvals',v_pending_cdes,
      'active_contract_present',v_active_contract,'latest_contract_status',v_contract_status,
      'latest_quality_score',v_latest_quality,'open_high_severity_items',v_high_open,
      'current_certification_status',v_current_cert,'scoring_model','seven_equal_evidence_factors_v1'
    ),now())
    on conflict(project_id,dataset_id) do update set readiness_score=excluded.readiness_score,readiness_status=excluded.readiness_status,blockers=excluded.blockers,evidence=excluded.evidence,assessed_at=excluded.assessed_at;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('project_id',p_project_id,'datasets_assessed',v_count);
end;
$$;

create or replace function governance.refresh_governance_roi(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog, agent
as $$
declare
  v_dataset_count integer;
  v_profiles_total integer; v_profiles_success integer;
  v_agent_total integer; v_agent_success integer;
  v_rem_total integer; v_rem_worked integer;
  v_issues_total integer; v_issues_resolved integer;
  v_incidents_total integer; v_incidents_resolved integer;
  v_contract_total integer; v_contract_passed integer;
  v_certified_datasets integer;
  v_eval_avg numeric;
  v_profile_rate numeric; v_agent_rate numeric; v_rem_rate numeric; v_issue_rate numeric; v_incident_rate numeric; v_contract_rate numeric; v_cert_rate numeric;
  v_sum numeric:=0; v_dims integer:=0; v_value numeric; v_confidence numeric;
  v_automation_events bigint;
  v_metrics jsonb;
begin
  select count(*) into v_dataset_count from catalog.datasets where project_id=p_project_id and status='ACTIVE';
  select count(*),count(*) filter(where pr.status='COMPLETED') into v_profiles_total,v_profiles_success
  from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id and pr.status in ('COMPLETED','FAILED','PARTIAL');
  select count(*),count(*) filter(where status='SUCCEEDED') into v_agent_total,v_agent_success from agent.agent_runs where project_id=p_project_id and status in ('SUCCEEDED','FAILED');
  select count(*) filter(where outcome_status in ('WORKED','FAILED')),count(*) filter(where outcome_status='WORKED') into v_rem_total,v_rem_worked from governance.remediation_knowledge where project_id=p_project_id;
  select count(*),count(*) filter(where resolved_at is not null or status in ('RESOLVED','CLOSED','DONE')) into v_issues_total,v_issues_resolved from governance.issues where project_id=p_project_id;
  select count(*),count(*) filter(where resolved_at is not null or status in ('RESOLVED','CLOSED','DONE')) into v_incidents_total,v_incidents_resolved from governance.observability_incidents where project_id=p_project_id;
  select count(*),count(*) filter(where status='PASSED') into v_contract_total,v_contract_passed from governance.data_contract_evaluations where project_id=p_project_id;
  select count(distinct dataset_id) into v_certified_datasets from governance.dataset_certifications where project_id=p_project_id and certification_status in ('CERTIFIED','PROVISIONAL') and (valid_until is null or valid_until>now());
  select round(avg(score),4) into v_eval_avg from agent.agent_evaluations where project_id=p_project_id and score is not null;
  select coalesce(count(*),0) into v_automation_events from profiling.quality_rule_runs qr join profiling.quality_rule_definitions qd on qd.id=qr.rule_definition_id where qd.project_id=p_project_id;
  v_automation_events:=v_automation_events+v_profiles_success+v_agent_success;

  if v_profiles_total>0 then v_profile_rate:=v_profiles_success::numeric/v_profiles_total; v_sum:=v_sum+v_profile_rate; v_dims:=v_dims+1; end if;
  if v_agent_total>0 then v_agent_rate:=v_agent_success::numeric/v_agent_total; v_sum:=v_sum+v_agent_rate; v_dims:=v_dims+1; end if;
  if v_rem_total>0 then v_rem_rate:=v_rem_worked::numeric/v_rem_total; v_sum:=v_sum+v_rem_rate; v_dims:=v_dims+1; end if;
  if v_issues_total>0 then v_issue_rate:=v_issues_resolved::numeric/v_issues_total; v_sum:=v_sum+v_issue_rate; v_dims:=v_dims+1; end if;
  if v_incidents_total>0 then v_incident_rate:=v_incidents_resolved::numeric/v_incidents_total; v_sum:=v_sum+v_incident_rate; v_dims:=v_dims+1; end if;
  if v_contract_total>0 then v_contract_rate:=v_contract_passed::numeric/v_contract_total; v_sum:=v_sum+v_contract_rate; v_dims:=v_dims+1; end if;
  if v_dataset_count>0 then v_cert_rate:=v_certified_datasets::numeric/v_dataset_count; v_sum:=v_sum+v_cert_rate; v_dims:=v_dims+1; end if;
  if v_eval_avg is not null then v_sum:=v_sum+v_eval_avg; v_dims:=v_dims+1; end if;

  v_value:=case when v_dims>0 then round(v_sum/v_dims,4) else null end;
  v_confidence:=least(1::numeric,round(v_dims::numeric/8,4));
  v_metrics:=jsonb_build_object(
    'automation_events_observed',v_automation_events,
    'profiling_success_rate',v_profile_rate,
    'agent_success_rate',v_agent_rate,
    'remediation_effectiveness_rate',v_rem_rate,
    'issue_resolution_rate',v_issue_rate,
    'incident_resolution_rate',v_incident_rate,
    'contract_compliance_rate',v_contract_rate,
    'certification_coverage_rate',v_cert_rate,
    'average_agent_evaluation_score',v_eval_avg,
    'dimensions_with_evidence',v_dims,
    'value_model','observed_outcome_rates_v1'
  );

  insert into governance.governance_roi_snapshots(project_id,value_score,confidence,metrics,limitations,calculated_at)
  values(p_project_id,v_value,v_confidence,v_metrics,jsonb_build_array(
    'Financial ROI is not estimated without explicit cost, revenue, or avoided-loss evidence.',
    'Manual hours saved are not estimated without measured before/after effort data.',
    'Observed automation events and outcome rates demonstrate operational value but do not prove causal financial impact.'
  ),now())
  on conflict(project_id) do update set value_score=excluded.value_score,confidence=excluded.confidence,metrics=excluded.metrics,limitations=excluded.limitations,calculated_at=excluded.calculated_at;

  return jsonb_build_object('project_id',p_project_id,'value_score',v_value,'confidence',v_confidence,'metrics',v_metrics);
end;
$$;

create or replace function governance.refresh_ai_governance_intelligence()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare p record; v_projects integer:=0; v_cert_datasets integer:=0; v_cert jsonb;
begin
  for p in select id from app.projects loop
    v_cert:=governance.refresh_certification_readiness(p.id);
    perform governance.refresh_governance_roi(p.id);
    v_projects:=v_projects+1;
    v_cert_datasets:=v_cert_datasets+coalesce((v_cert->>'datasets_assessed')::integer,0);
  end loop;
  return jsonb_build_object('projects_refreshed',v_projects,'certification_datasets_assessed',v_cert_datasets);
end;
$$;

revoke all on function governance.refresh_certification_readiness(uuid) from public,anon,authenticated;
revoke all on function governance.refresh_governance_roi(uuid) from public,anon,authenticated;
revoke all on function governance.refresh_ai_governance_intelligence() from public,anon,authenticated;
grant execute on function governance.refresh_certification_readiness(uuid) to service_role;
grant execute on function governance.refresh_governance_roi(uuid) to service_role;
grant execute on function governance.refresh_ai_governance_intelligence() to service_role;
