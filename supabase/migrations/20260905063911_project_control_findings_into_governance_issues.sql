alter table governance.issues
  add column control_finding_id uuid references governance.governance_findings(id) on delete cascade;

create unique index issues_control_finding_identity
  on governance.issues(control_finding_id)
  where control_finding_id is not null;

create or replace function governance.protect_control_managed_issue()
returns trigger
language plpgsql
set search_path=''
as $function$
declare
  v_context boolean := coalesce(pg_catalog.current_setting('governance.control_issue_projection_context', true), '') = 'true';
begin
  if tg_op = 'INSERT' then
    if new.control_finding_id is not null and not v_context then
      raise exception 'Control-managed governance issues may only be created by the control finding projection';
    end if;
    return new;
  end if;

  if old.control_finding_id is not null and not v_context then
    if tg_op = 'DELETE' then
      raise exception 'Control-managed governance issues may only be deleted through the control finding lifecycle';
    end if;
    if new.control_finding_id is distinct from old.control_finding_id
      or new.project_id is distinct from old.project_id
      or new.dataset_id is distinct from old.dataset_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.severity is distinct from old.severity
      or new.status is distinct from old.status
      or new.resolution_summary is distinct from old.resolution_summary
      or new.resolution_evidence is distinct from old.resolution_evidence
      or new.resolved_at is distinct from old.resolved_at then
      raise exception 'Control-managed governance issue state is derived from the control finding and cannot be changed directly';
    end if;
  elsif new.control_finding_id is not null and not v_context then
    raise exception 'An existing governance issue cannot be converted into a control-managed issue directly';
  end if;
  return new;
end;
$function$;

revoke execute on function governance.protect_control_managed_issue() from public, anon, authenticated;

create trigger trg_protect_control_managed_issue
before insert or update or delete on governance.issues
for each row execute function governance.protect_control_managed_issue();

create or replace function governance.project_control_finding_to_issue()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_control governance.control_definitions%rowtype;
  v_evaluation governance.control_evaluations%rowtype;
  v_scope governance.control_scope_bindings%rowtype;
  v_issue_id uuid;
  v_dataset_id uuid;
  v_issue_status text;
  v_resolution_summary text;
  v_resolution_evidence jsonb;
  v_description text;
begin
  select * into v_control
  from governance.control_definitions
  where id = new.control_id and project_id = new.project_id;
  if not found then
    raise exception 'Control finding % references a missing governance control', new.id;
  end if;

  if new.evaluation_id is not null then
    select * into v_evaluation
    from governance.control_evaluations
    where id = new.evaluation_id and project_id = new.project_id and control_id = new.control_id;
    if not found then
      raise exception 'Control finding % references an invalid control evaluation', new.id;
    end if;
    if v_evaluation.scope_binding_id is not null then
      select * into v_scope
      from governance.control_scope_bindings
      where id = v_evaluation.scope_binding_id and project_id = new.project_id and control_id = new.control_id;
      if found and v_scope.scope_type = 'DATASET' then
        v_dataset_id := v_scope.scope_id;
      end if;
    end if;
  end if;

  v_issue_status := case new.status
    when 'OPEN' then 'OPEN'
    when 'ACKNOWLEDGED' then 'TRIAGED'
    when 'RESOLVED' then 'RESOLVED'
    when 'WAIVED' then 'CLOSED'
    else 'OPEN'
  end;

  v_resolution_summary := case
    when new.status = 'RESOLVED' then 'Resolved by the governance control evaluation lifecycle.'
    when new.status = 'WAIVED' then 'Waived through the governance control finding lifecycle.'
    else null
  end;

  v_resolution_evidence := jsonb_build_object(
    'source', 'GOVERNANCE_CONTROL_FINDING',
    'control_id', new.control_id,
    'control_key', v_control.control_key,
    'control_authority_class', v_control.authority_class,
    'control_finding_id', new.id,
    'control_evaluation_id', new.evaluation_id,
    'control_evaluation_result', case when new.evaluation_id is null then null else v_evaluation.result end,
    'finding_status', new.status,
    'projected_at', now()
  );

  v_description := concat(
    new.description,
    E'\n\nControl: ', v_control.control_key,
    E'\nAuthority: ', v_control.authority_class,
    E'\nEvaluation result: ', coalesce(v_evaluation.result, 'NOT_AVAILABLE'),
    E'\nThis issue is a governed projection of control finding ', new.finding_key, '.'
  );

  perform pg_catalog.set_config('governance.control_issue_projection_context', 'true', true);

  select id into v_issue_id
  from governance.issues
  where control_finding_id = new.id
  for update;

  if found then
    update governance.issues
    set dataset_id = v_dataset_id,
        title = 'Governance control: ' || new.title,
        description = v_description,
        severity = new.severity,
        status = v_issue_status,
        resolution_summary = v_resolution_summary,
        resolution_evidence = v_resolution_evidence,
        resolved_at = case when v_issue_status in ('RESOLVED','CLOSED') then coalesce(new.resolved_at, now()) else null end,
        updated_at = now()
    where id = v_issue_id;
  else
    insert into governance.issues(
      project_id, dataset_id, title, description, severity, status,
      resolution_summary, resolution_evidence, resolved_at, control_finding_id
    ) values (
      new.project_id, v_dataset_id, 'Governance control: ' || new.title, v_description,
      new.severity, v_issue_status, v_resolution_summary, v_resolution_evidence,
      case when v_issue_status in ('RESOLVED','CLOSED') then coalesce(new.resolved_at, now()) else null end,
      new.id
    ) returning id into v_issue_id;
  end if;

  perform pg_catalog.set_config('governance.control_issue_projection_context', 'false', true);
  return new;
end;
$function$;

revoke execute on function governance.project_control_finding_to_issue() from public, anon, authenticated;

create trigger trg_project_control_finding_to_issue
after insert or update of status, severity, title, description, remediation, evaluation_id, resolved_at on governance.governance_findings
for each row execute function governance.project_control_finding_to_issue();
