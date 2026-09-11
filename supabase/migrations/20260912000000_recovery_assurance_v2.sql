-- Recovery Assurance v2: fail-closed, scope-aware recovery readiness.

alter table governance.recovery_policies
  add column if not exists required_scopes text[] not null default array[
    'DATABASE','STORAGE','IDENTITY_CONFIG','APPLICATION_CONFIG','EDGE_RUNTIME','DEPENDENCIES','SERVICE_VALIDATION'
  ]::text[];

alter table governance.backup_restore_drills
  add column if not exists recovery_mechanism text,
  add column if not exists incident_at timestamptz,
  add column if not exists recovery_point_at timestamptz,
  add column if not exists service_ready_at timestamptz,
  add column if not exists scope_results jsonb not null default '{}'::jsonb,
  add column if not exists external_evidence_ref text;

alter table governance.backup_restore_drills
  drop constraint if exists backup_restore_drills_recovery_mechanism_check;
alter table governance.backup_restore_drills
  add constraint backup_restore_drills_recovery_mechanism_check
  check(recovery_mechanism is null or recovery_mechanism in ('MANAGED_PITR','MANAGED_BACKUP','PORTABLE_LOGICAL_EXPORT','PROVIDER_RECONSTRUCTION'));

create or replace function governance.recovery_scope_coverage(
  p_scope_results jsonb,
  p_required_scopes text[]
) returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,governance
as $$
declare
  v_scope text;
  v_missing text[] := '{}';
  v_failed text[] := '{}';
begin
  foreach v_scope in array coalesce(p_required_scopes,'{}'::text[]) loop
    if not coalesce(p_scope_results,'{}'::jsonb) ? v_scope then
      v_missing := array_append(v_missing,v_scope);
    elsif upper(coalesce(p_scope_results->v_scope->>'status','')) <> 'PASSED' then
      v_failed := array_append(v_failed,v_scope);
    end if;
  end loop;

  return jsonb_build_object(
    'complete',cardinality(v_missing)=0 and cardinality(v_failed)=0,
    'missing_scopes',to_jsonb(v_missing),
    'failed_scopes',to_jsonb(v_failed)
  );
end;
$$;

revoke execute on function governance.recovery_scope_coverage(jsonb,text[]) from public,anon,authenticated;
grant execute on function governance.recovery_scope_coverage(jsonb,text[]) to service_role;

create or replace function governance.evaluate_recovery_drill()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare
  v_policy governance.recovery_policies%rowtype;
  v_coverage jsonb;
begin
  if new.project_id is null or new.status not in ('PASSED','FAILED') then
    new.policy_result := 'NOT_EVALUATED';
    return new;
  end if;

  select * into v_policy
  from governance.recovery_policies
  where project_id=new.project_id and enabled=true;

  if not found then
    new.policy_result := 'NOT_EVALUATED';
    return new;
  end if;

  v_coverage := governance.recovery_scope_coverage(new.scope_results,v_policy.required_scopes);

  -- RPO and RTO are authoritative only when derived from timestamps captured by the drill.
  if new.incident_at is null
     or new.recovery_point_at is null
     or new.started_at is null
     or new.service_ready_at is null then
    new.measured_rpo_minutes := null;
    new.measured_rto_minutes := null;
    new.policy_result := 'NOT_EVALUATED';
    return new;
  end if;

  if new.recovery_point_at > new.incident_at or new.service_ready_at < new.started_at then
    new.measured_rpo_minutes := null;
    new.measured_rto_minutes := null;
    new.policy_result := 'NOT_EVALUATED';
    return new;
  end if;

  new.measured_rpo_minutes := greatest(0,ceil(extract(epoch from (new.incident_at-new.recovery_point_at))/60.0)::integer);
  new.measured_rto_minutes := greatest(0,ceil(extract(epoch from (new.service_ready_at-new.started_at))/60.0)::integer);

  if coalesce((v_coverage->>'complete')::boolean,false)=false
     or new.external_evidence_ref is null
     or btrim(new.external_evidence_ref)='' then
    new.policy_result := 'NOT_EVALUATED';
    return new;
  end if;

  new.policy_result := case
    when new.status='PASSED'
      and new.measured_rpo_minutes<=v_policy.target_rpo_minutes
      and new.measured_rto_minutes<=v_policy.target_rto_minutes
    then 'PASSED'
    else 'FAILED'
  end;

  return new;
end;
$$;

revoke execute on function governance.evaluate_recovery_drill() from public,anon,authenticated;
grant execute on function governance.evaluate_recovery_drill() to service_role;

create or replace function governance.recovery_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,governance
as $$
declare
  v_policy governance.recovery_policies%rowtype;
  v_drill governance.backup_restore_drills%rowtype;
  v_due timestamptz;
  v_coverage jsonb;
begin
  select * into v_policy from governance.recovery_policies where project_id=p_project_id;
  if not found then
    return jsonb_build_object('status','NO_POLICY','project_id',p_project_id);
  end if;

  select * into v_drill
  from governance.backup_restore_drills
  where project_id=p_project_id and status in ('PASSED','FAILED')
  order by coalesce(service_ready_at,completed_at,created_at) desc
  limit 1;

  v_due := coalesce(v_drill.service_ready_at,v_drill.completed_at,v_drill.created_at,now()-make_interval(days=>v_policy.drill_frequency_days+1))
    + make_interval(days=>v_policy.drill_frequency_days);
  v_coverage := governance.recovery_scope_coverage(v_drill.scope_results,v_policy.required_scopes);

  return jsonb_build_object(
    'status',case
      when not v_policy.enabled then 'DISABLED'
      when v_drill.id is null then 'DRILL_REQUIRED'
      when coalesce((v_coverage->>'complete')::boolean,false)=false then 'SCOPE_COVERAGE_INCOMPLETE'
      when v_drill.external_evidence_ref is null or btrim(v_drill.external_evidence_ref)='' then 'EXTERNAL_EVIDENCE_REQUIRED'
      when v_drill.incident_at is null or v_drill.recovery_point_at is null or v_drill.started_at is null or v_drill.service_ready_at is null then 'TIMING_EVIDENCE_REQUIRED'
      when v_drill.policy_result<>'PASSED' then 'TARGETS_NOT_MET'
      when v_due<now() then 'DRILL_OVERDUE'
      else 'READY'
    end,
    'project_id',p_project_id,
    'policy',jsonb_build_object(
      'target_rpo_minutes',v_policy.target_rpo_minutes,
      'target_rto_minutes',v_policy.target_rto_minutes,
      'drill_frequency_days',v_policy.drill_frequency_days,
      'required_scopes',v_policy.required_scopes,
      'enabled',v_policy.enabled
    ),
    'scope_coverage',v_coverage,
    'latest_drill',case when v_drill.id is null then null else jsonb_build_object(
      'id',v_drill.id,
      'drill_type',v_drill.drill_type,
      'status',v_drill.status,
      'policy_result',v_drill.policy_result,
      'recovery_mechanism',v_drill.recovery_mechanism,
      'measured_rpo_minutes',v_drill.measured_rpo_minutes,
      'measured_rto_minutes',v_drill.measured_rto_minutes,
      'incident_at',v_drill.incident_at,
      'recovery_point_at',v_drill.recovery_point_at,
      'service_ready_at',v_drill.service_ready_at,
      'external_evidence_ref',v_drill.external_evidence_ref,
      'completed_at',v_drill.completed_at
    ) end,
    'next_drill_due_at',v_due
  );
end;
$$;

revoke execute on function governance.recovery_readiness(uuid) from public,anon,authenticated;
grant execute on function governance.recovery_readiness(uuid) to service_role;

comment on column governance.recovery_policies.required_scopes is 'Recovery scopes that must all pass before project recovery readiness can become READY.';
comment on column governance.backup_restore_drills.scope_results is 'Per-scope recovery evidence. Secret values must never be stored here.';
comment on column governance.backup_restore_drills.external_evidence_ref is 'Reference to independent evidence outside the source database, such as an immutable workflow artifact.';

select pg_notify('pgrst','reload schema');
