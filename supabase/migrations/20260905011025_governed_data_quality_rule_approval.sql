alter table profiling.quality_rule_definitions
  add column if not exists approval_status text not null default 'NOT_REQUIRED',
  add column if not exists reviewed_by uuid null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists review_comment text null;

alter table profiling.quality_rule_definitions
  drop constraint if exists quality_rule_definitions_approval_status_check;
alter table profiling.quality_rule_definitions
  add constraint quality_rule_definitions_approval_status_check
  check (approval_status in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'));

update profiling.quality_rule_definitions
set approval_status='PENDING',
    enabled=false,
    reviewed_by=null,
    reviewed_at=null,
    review_comment=null,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'approval_policy','HUMAN_REVIEW_REQUIRED',
      'approval_migration_applied_at',now(),
      'historically_executed_before_approval_policy',true
    ),
    updated_at=now()
where origin='SUGGESTED' and approval_status<>'APPROVED';

create or replace function profiling.protect_quality_rule_approval()
returns trigger
language plpgsql
set search_path to 'pg_catalog','profiling'
as $$
declare
  v_review_context boolean := current_user='postgres'
    and coalesce(current_setting('profiling.quality_rule_review_context',true),'')='true';
  v_material_change boolean := false;
begin
  if tg_op='INSERT' then
    if new.origin='SUGGESTED' then
      if new.approval_status in ('APPROVED','REJECTED') and not v_review_context then
        raise exception 'Suggested quality rule final approval state must be written through the governed review workflow';
      end if;
      if not v_review_context then
        new.approval_status := 'PENDING';
        new.enabled := false;
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.review_comment := null;
        new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('approval_policy','HUMAN_REVIEW_REQUIRED');
      end if;
    elsif new.approval_status='PENDING' then
      new.enabled := false;
    end if;
    return new;
  end if;

  if old.origin='SUGGESTED' and new.origin is distinct from old.origin and not v_review_context then
    raise exception 'Suggested quality rule origin cannot be changed outside the governed review workflow';
  end if;

  if old.origin='SUGGESTED' then
    v_material_change :=
      new.column_name is distinct from old.column_name or
      new.rule_key is distinct from old.rule_key or
      new.dimension is distinct from old.dimension or
      new.severity is distinct from old.severity or
      new.metric_key is distinct from old.metric_key or
      new.operator is distinct from old.operator or
      new.threshold is distinct from old.threshold or
      new.rule_type is distinct from old.rule_type or
      new.rule_config is distinct from old.rule_config or
      new.certification_required is distinct from old.certification_required;

    if v_material_change and old.approval_status='APPROVED' and not v_review_context then
      new.approval_status := 'PENDING';
      new.enabled := false;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_comment := null;
      new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
        'approval_policy','HUMAN_REVIEW_REQUIRED',
        'approval_reset_reason','MATERIAL_RULE_CHANGE',
        'approval_reset_at',now()
      );
    end if;

    if (
      new.approval_status is distinct from old.approval_status or
      new.reviewed_by is distinct from old.reviewed_by or
      new.reviewed_at is distinct from old.reviewed_at or
      new.review_comment is distinct from old.review_comment
    ) and not v_review_context and not (v_material_change and old.approval_status='APPROVED' and new.approval_status='PENDING') then
      raise exception 'Suggested quality rule approval decision/provenance must be written through the governed review workflow';
    end if;

    if new.approval_status<>'APPROVED' then
      new.enabled := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_quality_rule_approval on profiling.quality_rule_definitions;
create trigger trg_protect_quality_rule_approval
before insert or update on profiling.quality_rule_definitions
for each row execute function profiling.protect_quality_rule_approval();

create or replace function profiling.review_quality_rule(
  p_project_id uuid,
  p_rule_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','profiling','governance'
as $$
declare
  v_previous text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_rule profiling.quality_rule_definitions%rowtype;
begin
  if p_reviewer is null then
    raise exception 'Quality rule review requires an accountable reviewer user id';
  end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'quality.manage') then
    raise exception 'Reviewer is not authorized for quality.manage in this project';
  end if;
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'Quality rule review decision must be APPROVED or REJECTED';
  end if;
  if char_length(coalesce(p_comment,''))>2000 then
    raise exception 'Quality rule review comment must be 2000 characters or fewer';
  end if;

  select * into v_rule
  from profiling.quality_rule_definitions
  where id=p_rule_id and project_id=p_project_id
  for update;
  if not found then raise exception 'Quality rule was not found in this project'; end if;
  if v_rule.origin<>'SUGGESTED' then
    raise exception 'Only SUGGESTED quality rules use the human approval workflow';
  end if;
  v_previous := v_rule.approval_status;

  perform set_config('profiling.quality_rule_review_context','true',true);
  update profiling.quality_rule_definitions
  set approval_status=v_decision,
      enabled=(v_decision='APPROVED'),
      reviewed_by=p_reviewer,
      reviewed_at=now(),
      review_comment=nullif(btrim(coalesce(p_comment,'')),''),
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('approval_review',jsonb_build_object(
        'previous_status',v_previous,'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),
        'comment',nullif(btrim(coalesce(p_comment,'')),''),'human_review',true)),
      updated_at=now()
  where id=p_rule_id and project_id=p_project_id
  returning * into v_rule;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_reviewer,'USER','QUALITY_RULE_REVIEW_DECIDED','QUALITY_RULE',p_rule_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'comment',nullif(btrim(coalesce(p_comment,'')),''),
      'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true));

  return jsonb_build_object('id',v_rule.id,'project_id',v_rule.project_id,'dataset_id',v_rule.dataset_id,
    'rule_key',v_rule.rule_key,'previous_status',v_previous,'approval_status',v_rule.approval_status,'enabled',v_rule.enabled,
    'reviewed_by',v_rule.reviewed_by,'reviewed_at',v_rule.reviewed_at,'review_comment',v_rule.review_comment,
    'audit_atomic',true,'database_capability_verified',true);
end;
$$;

revoke all on function profiling.review_quality_rule(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function profiling.review_quality_rule(uuid,uuid,uuid,text,text) to service_role;

comment on column profiling.quality_rule_definitions.approval_status is 'Human governance state for SUGGESTED rules. Suggested rules remain disabled until APPROVED.';
