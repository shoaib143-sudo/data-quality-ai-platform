create or replace function governance.review_dataset_classification(
  p_project_id uuid,
  p_classification_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare
  v_previous text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_result governance.dataset_classifications%rowtype;
begin
  if p_reviewer is null then raise exception 'Classification review requires an accountable reviewer user id'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Classification review decision must be APPROVED or REJECTED'; end if;
  if char_length(coalesce(p_comment,'')) > 2000 then raise exception 'Classification review comment must be 2000 characters or fewer'; end if;

  select status into v_previous from governance.dataset_classifications
  where id=p_classification_id and project_id=p_project_id for update;
  if not found then raise exception 'Classification suggestion was not found in this project'; end if;

  update governance.dataset_classifications
  set status=v_decision,
      approved_by=case when v_decision='APPROVED' then p_reviewer else null end,
      reviewed_by=p_reviewer,reviewed_at=now(),review_comment=nullif(btrim(coalesce(p_comment,'')),''),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('review',jsonb_build_object(
        'previous_status',v_previous,'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),
      updated_at=now()
  where id=p_classification_id and project_id=p_project_id
  returning * into v_result;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','DATASET_CLASSIFICATION',p_classification_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'comment',nullif(btrim(coalesce(p_comment,'')),''),
      'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true));

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'column_name',v_result.column_name,'label_id',v_result.label_id,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment,'audit_atomic',true);
end;
$$;

create or replace function governance.review_cde_mapping(
  p_project_id uuid,
  p_mapping_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare
  v_previous text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_result governance.cde_mappings%rowtype;
begin
  if p_reviewer is null then raise exception 'CDE mapping review requires an accountable reviewer user id'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'CDE mapping review decision must be APPROVED or REJECTED'; end if;
  if char_length(coalesce(p_comment,'')) > 2000 then raise exception 'CDE mapping review comment must be 2000 characters or fewer'; end if;

  select status into v_previous from governance.cde_mappings
  where id=p_mapping_id and project_id=p_project_id for update;
  if not found then raise exception 'CDE mapping suggestion was not found in this project'; end if;

  update governance.cde_mappings
  set status=v_decision,reviewed_by=p_reviewer,reviewed_at=now(),review_comment=nullif(btrim(coalesce(p_comment,'')),''),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('review',jsonb_build_object(
        'previous_status',v_previous,'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),
      updated_at=now()
  where id=p_mapping_id and project_id=p_project_id
  returning * into v_result;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','CDE_MAPPING',p_mapping_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'comment',nullif(btrim(coalesce(p_comment,'')),''),
      'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true));

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'cde_id',v_result.cde_id,'column_name',v_result.column_name,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment,'audit_atomic',true);
end;
$$;

revoke all on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) to service_role;
grant execute on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) to service_role;
