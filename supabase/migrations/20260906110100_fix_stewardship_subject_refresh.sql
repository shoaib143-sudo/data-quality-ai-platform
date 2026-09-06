-- System target/member lifecycle refreshes must not be blocked by human-assignment checks.
create or replace function governance.enforce_stewardship_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project_org uuid;
  v_target_project uuid;
  v_dataset_name text;
  v_asset record;
  v_assignment_decision_changed boolean;
begin
  new.role:=upper(btrim(new.role));
  new.target_type:=upper(btrim(new.target_type));
  new.status:=upper(btrim(new.status));
  new.origin:=upper(btrim(new.origin));
  new.accountability:=nullif(btrim(coalesce(new.accountability,'')),'');
  new.decision_reason:=nullif(btrim(coalesce(new.decision_reason,'')),'');
  new.updated_at:=now();
  if new.assigned_at is null then new.assigned_at:=coalesce(new.created_at,now()); end if;

  if new.role not in ('BUSINESS_OWNER','TECHNICAL_OWNER','DATA_STEWARD','CUSTODIAN') then
    raise exception 'Unsupported stewardship role %',new.role;
  end if;
  if new.status not in ('PROPOSED','ACTIVE','REVOKED') then raise exception 'Unsupported stewardship status'; end if;
  if new.origin not in ('HUMAN','IMPORTED','AI_SUGGESTED','LEGACY') then raise exception 'Unsupported stewardship origin'; end if;
  if new.origin='AI_SUGGESTED' and new.status<>'PROPOSED' then raise exception 'AI stewardship suggestions cannot become authoritative without human action'; end if;

  select organization_id into v_project_org from app.projects where id=new.project_id;
  if v_project_org is null then raise exception 'Stewardship project not found'; end if;

  if new.target_type='DATASET' then
    select project_id,name into v_target_project,v_dataset_name from catalog.datasets where id=new.dataset_id;
    if v_target_project is null then
      if tg_op='UPDATE' and new.target_state='STALE' then
        new.target_locator:=coalesce(new.target_locator,'Deleted governed dataset');
      else
        raise exception 'Stewardship dataset target not found';
      end if;
    elsif v_target_project<>new.project_id then
      raise exception 'Stewardship dataset target belongs to another project';
    else
      new.target_locator:=v_dataset_name;
      if new.target_state<>'STALE' then new.target_state:='CURRENT'; end if;
    end if;
    new.discovered_asset_id:=null; new.data_source_id:=null; new.catalog_identity_key:=null;
  elsif new.target_type='CATALOG_ASSET' then
    if new.target_state='CURRENT' then
      select da.id,da.source_id,da.identity_key,da.namespace,da.name,ds.project_id
        into v_asset
      from catalog.discovered_assets da
      join catalog.data_sources ds on ds.id=da.source_id
      where da.id=new.discovered_asset_id and da.is_current;
      if v_asset.id is null then raise exception 'Stewardship catalog target must be a current discovered asset'; end if;
      if v_asset.project_id<>new.project_id then raise exception 'Stewardship catalog target belongs to another project'; end if;
      if nullif(v_asset.identity_key,'') is null then raise exception 'Stewardship catalog target requires stable catalog identity evidence'; end if;
      new.data_source_id:=v_asset.source_id;
      new.catalog_identity_key:=v_asset.identity_key;
      new.target_locator:=coalesce(nullif(v_asset.namespace,'')||'.','')||v_asset.name;
    else
      select project_id into v_target_project from catalog.data_sources where id=new.data_source_id;
      if v_target_project is null or v_target_project<>new.project_id then raise exception 'Stale stewardship catalog target source is invalid'; end if;
    end if;
  else
    raise exception 'Unsupported stewardship target type';
  end if;

  if new.status in ('PROPOSED','ACTIVE') and new.subject_state='CURRENT' then
    if not exists(
      select 1 from app.organization_members om
      where om.organization_id=v_project_org and om.user_id=new.user_id
    ) then
      raise exception 'Stewardship assignee must be a current organization member';
    end if;
  end if;

  v_assignment_decision_changed:=tg_op='INSERT'
    or (tg_op='UPDATE' and (old.status is distinct from new.status or old.assigned_by is distinct from new.assigned_by));
  if new.origin='HUMAN' and new.status='ACTIVE' and v_assignment_decision_changed then
    if new.assigned_by is null then raise exception 'Human stewardship assignments require an accountable assigning actor'; end if;
    if not exists(select 1 from app.organization_members om where om.organization_id=v_project_org and om.user_id=new.assigned_by) then
      raise exception 'Stewardship assigning actor must be a current organization member';
    end if;
  end if;

  if tg_op='UPDATE' then
    if old.status='REVOKED' and new.status<>'REVOKED' then raise exception 'Revoked stewardship assignments are historical; create a new assignment instead'; end if;
    if old.user_id is distinct from new.user_id or old.role is distinct from new.role or old.target_type is distinct from new.target_type
       or old.dataset_id is distinct from new.dataset_id or old.data_source_id is distinct from new.data_source_id
       or old.catalog_identity_key is distinct from new.catalog_identity_key then
      if not (old.target_type='CATALOG_ASSET' and new.target_type='CATALOG_ASSET' and old.data_source_id=new.data_source_id and old.catalog_identity_key=new.catalog_identity_key) then
        raise exception 'Stewardship assignment identity is immutable';
      end if;
    end if;
  end if;

  if new.status='REVOKED' then
    new.revoked_at:=coalesce(new.revoked_at,now());
  else
    new.revoked_by:=null; new.revoked_at:=null;
  end if;
  new.active:=(new.status='ACTIVE' and new.target_state='CURRENT' and new.subject_state='CURRENT');
  return new;
end;
$function$;
