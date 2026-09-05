create or replace function governance.protect_classification_human_review()
returns trigger
language plpgsql
set search_path to 'pg_catalog','governance'
as $$
declare
  v_review_context boolean := current_user = 'postgres'
    and coalesce(current_setting('governance.knowledge_review_context', true),'') = 'true';
begin
  if tg_op = 'INSERT' then
    if (new.status in ('APPROVED','REJECTED') or new.reviewed_by is not null or new.reviewed_at is not null)
       and not v_review_context then
      raise exception 'Classification final review state must be written through the governed review workflow';
    end if;
    return new;
  end if;

  if old.reviewed_at is not null
     and old.status in ('APPROVED','REJECTED')
     and new.status='SUGGESTED' then
    new.status := old.status;
    new.approved_by := old.approved_by;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    if old.evidence ? 'review' then
      new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object('review',old.evidence->'review');
    end if;
  end if;

  if (
      (new.status is distinct from old.status and new.status in ('APPROVED','REJECTED'))
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_comment is distinct from old.review_comment
      or new.approved_by is distinct from old.approved_by
     ) and not v_review_context then
    raise exception 'Classification review decision/provenance must be written through the governed review workflow';
  end if;
  return new;
end;
$$;

create or replace function governance.protect_cde_human_review()
returns trigger
language plpgsql
set search_path to 'pg_catalog','governance'
as $$
declare
  v_review_context boolean := current_user = 'postgres'
    and coalesce(current_setting('governance.knowledge_review_context', true),'') = 'true';
begin
  if tg_op = 'INSERT' then
    if (new.status in ('APPROVED','REJECTED') or new.reviewed_by is not null or new.reviewed_at is not null)
       and not v_review_context then
      raise exception 'CDE mapping final review state must be written through the governed review workflow';
    end if;
    return new;
  end if;

  if old.reviewed_at is not null
     and old.status in ('APPROVED','REJECTED')
     and new.status='SUGGESTED' then
    new.status := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    if old.evidence ? 'review' then
      new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object('review',old.evidence->'review');
    end if;
  end if;

  if (
      (new.status is distinct from old.status and new.status in ('APPROVED','REJECTED'))
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_comment is distinct from old.review_comment
     ) and not v_review_context then
    raise exception 'CDE mapping review decision/provenance must be written through the governed review workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_classification_human_review on governance.dataset_classifications;
create trigger trg_protect_classification_human_review
before insert or update on governance.dataset_classifications
for each row execute function governance.protect_classification_human_review();

drop trigger if exists trg_protect_cde_human_review on governance.cde_mappings;
create trigger trg_protect_cde_human_review
before insert or update on governance.cde_mappings
for each row execute function governance.protect_cde_human_review();

create or replace function governance.review_dataset_classification(
  p_project_id uuid,
  p_classification_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','governance'
as $$
declare
  v_previous text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_result governance.dataset_classifications%rowtype;
begin
  if p_reviewer is null then
    raise exception 'Classification review requires an accountable reviewer user id';
  end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'classification.review') then
    raise exception 'Reviewer is not authorized for classification.review in this project';
  end if;
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'Classification review decision must be APPROVED or REJECTED';
  end if;
  if char_length(coalesce(p_comment,'')) > 2000 then
    raise exception 'Classification review comment must be 2000 characters or fewer';
  end if;

  select status into v_previous
  from governance.dataset_classifications
  where id=p_classification_id and project_id=p_project_id
  for update;
  if not found then raise exception 'Classification suggestion was not found in this project'; end if;

  perform set_config('governance.knowledge_review_context','true',true);
  update governance.dataset_classifications
  set status=v_decision,
      approved_by=case when v_decision='APPROVED' then p_reviewer else null end,
      reviewed_by=p_reviewer,
      reviewed_at=now(),
      review_comment=nullif(btrim(coalesce(p_comment,'')),''),
      evidence=coalesce(evidence,'{}'::jsonb) || jsonb_build_object('review',jsonb_build_object(
        'previous_status',v_previous,'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),
      updated_at=now()
  where id=p_classification_id and project_id=p_project_id
  returning * into v_result;

  insert into governance.audit_events(
    project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata
  ) values (
    p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','DATASET_CLASSIFICATION',p_classification_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'comment',nullif(btrim(coalesce(p_comment,'')),''),
      'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true)
  );

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'column_name',v_result.column_name,'label_id',v_result.label_id,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment,
    'audit_atomic',true,'database_capability_verified',true);
end;
$$;

create or replace function governance.review_cde_mapping(
  p_project_id uuid,
  p_mapping_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','governance'
as $$
declare
  v_previous text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_result governance.cde_mappings%rowtype;
begin
  if p_reviewer is null then
    raise exception 'CDE mapping review requires an accountable reviewer user id';
  end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'stewardship.manage') then
    raise exception 'Reviewer is not authorized for stewardship.manage in this project';
  end if;
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'CDE mapping review decision must be APPROVED or REJECTED';
  end if;
  if char_length(coalesce(p_comment,'')) > 2000 then
    raise exception 'CDE mapping review comment must be 2000 characters or fewer';
  end if;

  select status into v_previous
  from governance.cde_mappings
  where id=p_mapping_id and project_id=p_project_id
  for update;
  if not found then raise exception 'CDE mapping suggestion was not found in this project'; end if;

  perform set_config('governance.knowledge_review_context','true',true);
  update governance.cde_mappings
  set status=v_decision,
      reviewed_by=p_reviewer,
      reviewed_at=now(),
      review_comment=nullif(btrim(coalesce(p_comment,'')),''),
      evidence=coalesce(evidence,'{}'::jsonb) || jsonb_build_object('review',jsonb_build_object(
        'previous_status',v_previous,'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),
      updated_at=now()
  where id=p_mapping_id and project_id=p_project_id
  returning * into v_result;

  insert into governance.audit_events(
    project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata
  ) values (
    p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','CDE_MAPPING',p_mapping_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'comment',nullif(btrim(coalesce(p_comment,'')),''),
      'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true)
  );

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'cde_id',v_result.cde_id,'column_name',v_result.column_name,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment,
    'audit_atomic',true,'database_capability_verified',true);
end;
$$;

revoke all on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) to service_role;
grant execute on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) to service_role;
