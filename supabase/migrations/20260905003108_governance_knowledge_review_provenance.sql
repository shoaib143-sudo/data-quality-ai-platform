alter table governance.dataset_classifications
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

alter table governance.cde_mappings
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

update governance.dataset_classifications
set reviewed_by=coalesce(reviewed_by,approved_by),
    reviewed_at=coalesce(reviewed_at,case when approved_by is not null then updated_at else null end)
where approved_by is not null and (reviewed_by is null or reviewed_at is null);

create index if not exists dataset_classifications_review_idx
  on governance.dataset_classifications(project_id,status,reviewed_at desc);
create index if not exists cde_mappings_review_idx
  on governance.cde_mappings(project_id,status,reviewed_at desc);

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

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'column_name',v_result.column_name,'label_id',v_result.label_id,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment);
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

  return jsonb_build_object('id',v_result.id,'project_id',v_result.project_id,'dataset_id',v_result.dataset_id,
    'cde_id',v_result.cde_id,'column_name',v_result.column_name,'previous_status',v_previous,'status',v_result.status,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'review_comment',v_result.review_comment);
end;
$$;

revoke all on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) to service_role;
grant execute on function governance.review_cde_mapping(uuid,uuid,uuid,text,text) to service_role;
