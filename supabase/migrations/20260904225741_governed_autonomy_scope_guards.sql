create or replace function governance.validate_autonomy_action_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, governance, catalog, profiling
as $$
declare
  v_policy governance.autonomy_policies%rowtype;
  v_input_dataset_id uuid;
  v_dataset_id uuid;
begin
  select * into v_policy from governance.autonomy_policies where id = new.policy_id;
  if not found then raise exception 'Autonomy policy not found'; end if;
  if v_policy.project_id <> new.project_id then raise exception 'Autonomy policy belongs to another project'; end if;
  if v_policy.action_key <> new.action_key then raise exception 'Autonomy policy action key mismatch'; end if;
  if array_length(v_policy.allowed_target_types,1) is not null and not (upper(new.target_type) = any(v_policy.allowed_target_types)) then
    raise exception 'Target type % is not allowlisted for action %', new.target_type, new.action_key;
  end if;

  if upper(new.target_type) = 'PROJECT' then
    if new.target_id is null or new.target_id <> new.project_id then raise exception 'Project autonomy target must equal project_id'; end if;
  elsif upper(new.target_type) = 'DATASET' then
    if new.target_id is null or not exists(select 1 from catalog.datasets d where d.id=new.target_id and d.project_id=new.project_id) then
      raise exception 'Dataset autonomy target is outside project scope';
    end if;
    begin
      v_input_dataset_id := nullif(coalesce(new.input->>'datasetId',new.input->>'dataset_id'),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'Autonomy input dataset identifier is invalid';
    end;
    if v_input_dataset_id is not null and v_input_dataset_id <> new.target_id then
      raise exception 'Autonomy input dataset must match governed target dataset';
    end if;
  elsif upper(new.target_type) = 'DATASET_VERSION' then
    if new.target_id is null then raise exception 'Dataset version autonomy target is required'; end if;
    select dv.dataset_id into v_dataset_id from catalog.dataset_versions dv where dv.id=new.target_id;
    if v_dataset_id is null or not exists(select 1 from catalog.datasets d where d.id=v_dataset_id and d.project_id=new.project_id) then
      raise exception 'Dataset version autonomy target is outside project scope';
    end if;
  elsif upper(new.target_type) = 'QUALITY_RULE' then
    if new.target_id is null or not exists(select 1 from profiling.quality_rule_definitions q where q.id=new.target_id and q.project_id=new.project_id) then
      raise exception 'Quality rule autonomy target is outside project scope';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists autonomy_actions_scope_guard on governance.autonomy_actions;
create trigger autonomy_actions_scope_guard
before insert or update of project_id,policy_id,action_key,target_type,target_id,input
on governance.autonomy_actions
for each row execute function governance.validate_autonomy_action_scope();

revoke all on function governance.validate_autonomy_action_scope() from public,anon,authenticated;
grant execute on function governance.validate_autonomy_action_scope() to service_role;
