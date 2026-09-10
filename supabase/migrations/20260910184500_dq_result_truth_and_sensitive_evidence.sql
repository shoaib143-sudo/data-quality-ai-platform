alter table profiling.quality_rule_runs
  add column if not exists result_state text;

update profiling.quality_rule_runs
set result_state = case status
  when 'PASSED' then 'PASS'
  when 'FAILED' then 'FAIL'
  when 'ERROR' then 'ERROR'
  when 'CANCELLED' then 'NOT_MEASURED'
  else null
end
where result_state is null;

alter table profiling.quality_rule_runs
  drop constraint if exists quality_rule_runs_status_check;

alter table profiling.quality_rule_runs
  add constraint quality_rule_runs_status_check
  check (status = any (array['RUNNING','PASSED','FAILED','ERROR','CANCELLED','COMPLETED']::text[]));

alter table profiling.quality_rule_runs
  drop constraint if exists quality_rule_runs_result_state_check;

alter table profiling.quality_rule_runs
  add constraint quality_rule_runs_result_state_check
  check (result_state is null or result_state = any (array[
    'PASS','FAIL','NOT_MEASURED','UNAVAILABLE','ERROR','NOT_APPLICABLE','WAIVED'
  ]::text[]));

alter table profiling.quality_rule_runs
  drop constraint if exists quality_rule_runs_result_consistency_check;

alter table profiling.quality_rule_runs
  add constraint quality_rule_runs_result_consistency_check
  check (
    (status='RUNNING' and result_state is null and passed is null)
    or (status='PASSED' and result_state='PASS' and passed is true)
    or (status='FAILED' and result_state='FAIL' and passed is false)
    or (status='ERROR' and result_state='ERROR' and passed is null)
    or (status='CANCELLED' and result_state='NOT_MEASURED' and passed is null)
    or (status='COMPLETED' and result_state in ('NOT_MEASURED','UNAVAILABLE','NOT_APPLICABLE','WAIVED') and passed is null)
  );

create index if not exists quality_rule_runs_result_state_completed_idx
  on profiling.quality_rule_runs (result_state, completed_at desc)
  where result_state is not null;

create or replace function profiling.normalize_quality_rule_result_truth()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling'
as $$
declare
  v_bound_version uuid;
begin
  select dataset_version_id into v_bound_version
  from profiling.quality_rule_definitions
  where id = new.rule_definition_id;

  if not found then
    raise exception 'Quality rule definition was not found for result';
  end if;

  if v_bound_version is not null and v_bound_version <> new.dataset_version_id then
    new.status := 'COMPLETED';
    new.result_state := 'NOT_APPLICABLE';
    new.passed := null;
    new.observed_value := null;
    new.error_message := null;
    new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object(
      'result_semantics','CANONICAL',
      'not_applicable_reason','RULE_BOUND_TO_DIFFERENT_DATASET_VERSION',
      'rule_dataset_version_id',v_bound_version,
      'evaluated_dataset_version_id',new.dataset_version_id
    );
    return new;
  end if;

  if new.status = 'RUNNING' then
    new.result_state := null;
    new.passed := null;
    return new;
  end if;

  if new.status = 'PASSED'
     and coalesce(new.evidence->>'sampled_rows','') = '0'
     and coalesce(new.evidence->>'source_row_count','') = '0' then
    new.status := 'COMPLETED';
    new.result_state := 'NOT_MEASURED';
    new.passed := null;
    new.observed_value := null;
    new.error_message := null;
    new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object(
      'result_semantics','CANONICAL',
      'not_measured_reason','NO_SOURCE_ROWS_AVAILABLE'
    );
    return new;
  end if;

  if new.status = 'ERROR'
     and (
       coalesce(new.evidence->>'reason','') = 'Required profiling metric was not persisted.'
       or coalesce(new.error_message,'') = 'Required profiling metric was not persisted.'
     ) then
    new.status := 'COMPLETED';
    new.result_state := 'UNAVAILABLE';
    new.passed := null;
    new.observed_value := null;
    new.error_message := null;
    new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object(
      'result_semantics','CANONICAL',
      'measurement_state','UNAVAILABLE',
      'unavailable_reason','REQUIRED_PROFILE_METRIC_NOT_PERSISTED'
    );
    return new;
  end if;

  if new.status = 'PASSED' then
    new.result_state := 'PASS';
    new.passed := true;
  elsif new.status = 'FAILED' then
    new.result_state := 'FAIL';
    new.passed := false;
  elsif new.status = 'ERROR' then
    new.result_state := 'ERROR';
    new.passed := null;
  elsif new.status = 'CANCELLED' then
    new.result_state := 'NOT_MEASURED';
    new.passed := null;
  elsif new.status = 'COMPLETED' then
    if new.result_state not in ('NOT_MEASURED','UNAVAILABLE','NOT_APPLICABLE','WAIVED') then
      raise exception 'COMPLETED quality results require an explicit non-binary result state';
    end if;
    new.passed := null;
  else
    raise exception 'Unsupported quality rule execution status %', new.status;
  end if;

  new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object(
    'result_semantics','CANONICAL',
    'result_state',new.result_state
  );
  return new;
end;
$$;

revoke execute on function profiling.normalize_quality_rule_result_truth() from public, anon, authenticated;
grant execute on function profiling.normalize_quality_rule_result_truth() to service_role;

drop trigger if exists quality_rule_run_result_truth on profiling.quality_rule_runs;
create trigger quality_rule_run_result_truth
before insert or update of status, passed, observed_value, dataset_version_id, evidence, error_message, result_state
on profiling.quality_rule_runs
for each row execute function profiling.normalize_quality_rule_result_truth();

create or replace function profiling.redact_governed_sensitive_sample(
  p_dataset_id uuid,
  p_sample jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = 'pg_catalog', 'profiling', 'governance'
as $$
  with sensitive as (
    select
      coalesce(bool_or(dc.column_name is null),false) as redact_all,
      coalesce(array_agg(dc.column_name) filter (where dc.column_name is not null),array[]::text[]) as sensitive_columns
    from governance.dataset_classifications dc
    join governance.classification_labels cl on cl.id=dc.label_id
    where dc.target_type='DATASET'
      and dc.dataset_id=p_dataset_id
      and dc.status='APPROVED'
      and dc.authority_state='AUTHORITATIVE'
      and dc.target_state='CURRENT'
      and cl.enabled
      and (coalesce(cl.sensitivity_level,0) >= 4 or coalesce(cl.privacy_category,'') in ('PII','PHI','PCI'))
  )
  select coalesce(jsonb_object_agg(
    e.key,
    case
      when s.redact_all or e.key = any(s.sensitive_columns) then to_jsonb('[REDACTED]'::text)
      else e.value
    end
  ),'{}'::jsonb)
  from jsonb_each(coalesce(p_sample,'{}'::jsonb)) e
  cross join sensitive s;
$$;

revoke execute on function profiling.redact_governed_sensitive_sample(uuid,jsonb) from public, anon, authenticated;
grant execute on function profiling.redact_governed_sensitive_sample(uuid,jsonb) to service_role;

create or replace function profiling.protect_quality_exception_sensitive_evidence()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling', 'governance', 'extensions'
as $$
declare
  v_dataset_id uuid;
  v_any_sensitive boolean := false;
  v_column_sensitive boolean := false;
begin
  select r.dataset_id into v_dataset_id
  from profiling.quality_rule_definitions r
  where r.id=new.rule_definition_id;

  if v_dataset_id is null then
    raise exception 'Quality exception rule definition has no governed dataset';
  end if;

  select
    exists(
      select 1
      from governance.dataset_classifications dc
      join governance.classification_labels cl on cl.id=dc.label_id
      where dc.target_type='DATASET'
        and dc.dataset_id=v_dataset_id
        and dc.status='APPROVED'
        and dc.authority_state='AUTHORITATIVE'
        and dc.target_state='CURRENT'
        and cl.enabled
        and (coalesce(cl.sensitivity_level,0) >= 4 or coalesce(cl.privacy_category,'') in ('PII','PHI','PCI'))
    ),
    exists(
      select 1
      from governance.dataset_classifications dc
      join governance.classification_labels cl on cl.id=dc.label_id
      where dc.target_type='DATASET'
        and dc.dataset_id=v_dataset_id
        and dc.status='APPROVED'
        and dc.authority_state='AUTHORITATIVE'
        and dc.target_state='CURRENT'
        and cl.enabled
        and (coalesce(cl.sensitivity_level,0) >= 4 or coalesce(cl.privacy_category,'') in ('PII','PHI','PCI'))
        and (dc.column_name is null or dc.column_name is not distinct from new.column_name)
    )
  into v_any_sensitive, v_column_sensitive;

  new.sample := profiling.redact_governed_sensitive_sample(v_dataset_id,new.sample);

  if v_column_sensitive and new.observed_value is not null then
    new.observed_value := '[REDACTED]';
  end if;

  if v_any_sensitive and new.record_key is not null and new.record_key not like 'sha256:%' then
    new.record_key := 'sha256:' || encode(extensions.digest(convert_to(new.record_key,'UTF8'),'sha256'),'hex');
  end if;

  return new;
end;
$$;

revoke execute on function profiling.protect_quality_exception_sensitive_evidence() from public, anon, authenticated;
grant execute on function profiling.protect_quality_exception_sensitive_evidence() to service_role;

drop trigger if exists quality_exception_sensitive_evidence on profiling.quality_rule_exceptions;
create trigger quality_exception_sensitive_evidence
before insert or update of rule_definition_id, column_name, observed_value, record_key, sample
on profiling.quality_rule_exceptions
for each row execute function profiling.protect_quality_exception_sensitive_evidence();

create or replace function profiling.protect_quarantine_sensitive_evidence()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling', 'governance', 'extensions'
as $$
declare
  v_any_sensitive boolean := false;
begin
  select exists(
    select 1
    from governance.dataset_classifications dc
    join governance.classification_labels cl on cl.id=dc.label_id
    where dc.target_type='DATASET'
      and dc.dataset_id=new.dataset_id
      and dc.status='APPROVED'
      and dc.authority_state='AUTHORITATIVE'
      and dc.target_state='CURRENT'
      and cl.enabled
      and (coalesce(cl.sensitivity_level,0) >= 4 or coalesce(cl.privacy_category,'') in ('PII','PHI','PCI'))
  ) into v_any_sensitive;

  new.sample := profiling.redact_governed_sensitive_sample(new.dataset_id,new.sample);

  if v_any_sensitive and new.record_key is not null and new.record_key not like 'sha256:%' then
    new.record_key := 'sha256:' || encode(extensions.digest(convert_to(new.record_key,'UTF8'),'sha256'),'hex');
  end if;

  return new;
end;
$$;

revoke execute on function profiling.protect_quarantine_sensitive_evidence() from public, anon, authenticated;
grant execute on function profiling.protect_quarantine_sensitive_evidence() to service_role;

drop trigger if exists quarantine_sensitive_evidence on profiling.quality_quarantine_records;
create trigger quarantine_sensitive_evidence
before insert or update of dataset_id, record_key, sample
on profiling.quality_quarantine_records
for each row execute function profiling.protect_quarantine_sensitive_evidence();

create or replace function governance.on_quality_rule_outcome()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'governance', 'profiling', 'catalog', 'orchestration'
as $$
declare v_dataset uuid; v_project uuid; v_severity text;
begin
  select d.id,d.project_id,r.severity into v_dataset,v_project,v_severity
  from profiling.quality_rule_definitions r join catalog.datasets d on d.id=r.dataset_id
  where r.id=new.rule_definition_id;
  if v_project is not null then
    perform orchestration.emit_event(v_project,'QUALITY_RULE_EVALUATED','QUALITY_RULE_RUN',new.id,'QUALITY_RULE_EVALUATED:'||new.id::text,
      jsonb_build_object(
        'quality_rule_run_id',new.id,
        'profile_run_id',new.profile_run_id,
        'dataset_version_id',new.dataset_version_id,
        'dataset_id',v_dataset,
        'status',new.status,
        'result_state',new.result_state,
        'severity',v_severity
      ));
  end if;
  if new.result_state='FAIL' and v_severity in ('HIGH','CRITICAL') then
    perform governance.invalidate_dataset_certification(v_dataset,'HIGH_SEVERITY_QUALITY_FAILURE',jsonb_build_object(
      'quality_rule_run_id',new.id,
      'result_state',new.result_state,
      'severity',v_severity
    ));
  end if;
  return new;
end;
$$;

create or replace function profiling.verify_quality_result_truth_posture()
returns jsonb
language sql
stable
security definer
set search_path = 'pg_catalog', 'profiling'
as $$
select jsonb_build_object(
  'valid',
    exists(select 1 from information_schema.columns where table_schema='profiling' and table_name='quality_rule_runs' and column_name='result_state')
    and exists(select 1 from pg_trigger where tgrelid='profiling.quality_rule_runs'::regclass and tgname='quality_rule_run_result_truth' and not tgisinternal and tgenabled<>'D')
    and exists(select 1 from pg_trigger where tgrelid='profiling.quality_rule_exceptions'::regclass and tgname='quality_exception_sensitive_evidence' and not tgisinternal and tgenabled<>'D')
    and exists(select 1 from pg_trigger where tgrelid='profiling.quality_quarantine_records'::regclass and tgname='quarantine_sensitive_evidence' and not tgisinternal and tgenabled<>'D'),
  'explicit_result_states',jsonb_build_array('PASS','FAIL','NOT_MEASURED','UNAVAILABLE','ERROR','NOT_APPLICABLE','WAIVED'),
  'zero_means_missing',false,
  'missing_means_pass',false,
  'execution_error_is_quality_result',false,
  'authoritative_classification_drives_redaction',true,
  'exception_observed_values_redacted',true,
  'sensitive_record_keys_hashed',true,
  'quarantine_samples_redacted',true
);
$$;

revoke execute on function profiling.verify_quality_result_truth_posture() from public, anon, authenticated;
grant execute on function profiling.verify_quality_result_truth_posture() to service_role;

select pg_notify('pgrst','reload schema');
