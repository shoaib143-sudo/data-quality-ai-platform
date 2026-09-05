create or replace function catalog.ensure_source_scope_version(p_project_id uuid,p_source_id uuid,p_native_selection jsonb,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path=catalog,public,extensions as $$
declare
  v_scope catalog.source_scopes%rowtype;
  v_current catalog.source_scope_versions%rowtype;
  v_input jsonb:=coalesce(p_native_selection,'{}'::jsonb);
  v_selection jsonb;
  v_rules jsonb;
  v_hash text;
  v_number integer;
  v_id uuid;
  v_mode text;
  v_inherit boolean;
  v_include_system boolean;
begin
  perform 1 from catalog.data_sources where id=p_source_id and project_id=p_project_id for update;
  if not found then raise exception 'Source does not belong to project.'; end if;

  v_mode:=case when upper(coalesce(v_input->>'mode','ALL'))='SELECTED' then 'SELECTED' else 'ALL' end;
  v_inherit:=coalesce((v_input->>'inheritFutureChildren')::boolean,true);
  v_include_system:=coalesce((v_input->>'includeSystem')::boolean,false);
  v_selection:=jsonb_build_object(
    'mode',v_mode,
    'nodeIds',coalesce(v_input->'nodeIds','[]'::jsonb),
    'qualifiedNames',coalesce(v_input->'qualifiedNames','[]'::jsonb),
    'excludedNodeIds',coalesce(v_input->'excludedNodeIds','[]'::jsonb),
    'excludedQualifiedNames',coalesce(v_input->'excludedQualifiedNames','[]'::jsonb),
    'includeSystem',v_include_system,
    'inheritFutureChildren',v_inherit
  );
  v_rules:=jsonb_build_object(
    'inherit_future_children',v_inherit,
    'metadata_discovery_field_scope','FULL_OBJECT',
    'exclusion_precedence','EXCLUDE_WINS',
    'include_system',v_include_system,
    'publication_unit','SOURCE_SCOPE',
    'selection',v_selection
  );
  v_hash:=catalog.catalog_json_hash(jsonb_build_object(
    'scope_mode','DYNAMIC',
    'publication_unit','SOURCE_SCOPE',
    'metadata_discovery_field_scope','FULL_OBJECT',
    'exclusion_precedence','EXCLUDE_WINS',
    'include_system',v_include_system,
    'inherit_future_children',v_inherit,
    'selection',v_selection
  ));

  insert into catalog.source_scopes(project_id,source_id,name)
  values(p_project_id,p_source_id,'default')
  on conflict(source_id,name) do update set updated_at=now()
  returning * into v_scope;

  if v_scope.current_version_id is not null then
    select * into v_current from catalog.source_scope_versions where id=v_scope.current_version_id;
    if found and v_current.scope_hash=v_hash then
      return jsonb_build_object('scope_id',v_scope.id,'scope_version_id',v_current.id,'version_number',v_current.version_number,'scope_hash',v_hash,'changed',false);
    end if;
  end if;

  select coalesce(max(version_number),0)+1 into v_number from catalog.source_scope_versions where scope_id=v_scope.id;
  insert into catalog.source_scope_versions(scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,created_by)
  values(v_scope.id,p_project_id,p_source_id,v_number,'DYNAMIC',v_selection,v_rules,v_hash,p_actor)
  returning id into v_id;
  update catalog.source_scopes set current_version_id=v_id,updated_at=now() where id=v_scope.id;
  return jsonb_build_object('scope_id',v_scope.id,'scope_version_id',v_id,'version_number',v_number,'scope_hash',v_hash,'changed',true);
end $$;

create or replace function catalog.seed_source_deletion_policy()
returns trigger language plpgsql security definer set search_path=catalog,public as $$
declare v_kind text:=lower(coalesce(new.connection_metadata->>'connection_kind',''));
begin
  insert into catalog.source_deletion_policies(source_id,project_id,policy_mode,confirmation_revisions,require_same_scope_version,metadata,updated_at)
  values(
    new.id,
    new.project_id,
    case when v_kind in ('databricks','postgresql','mssql','mysql') then 'CONFIRMED_ABSENCE' else 'MISSING_ONLY' end,
    2,
    true,
    jsonb_build_object('seeded_from_connection_kind',coalesce(nullif(v_kind,''),'unknown')),
    now()
  )
  on conflict(source_id) do nothing;
  return new;
end $$;

drop trigger if exists data_sources_seed_deletion_policy on catalog.data_sources;
create trigger data_sources_seed_deletion_policy
after insert or update of connection_metadata,source_type on catalog.data_sources
for each row execute function catalog.seed_source_deletion_policy();

insert into catalog.source_deletion_policies(source_id,project_id,policy_mode,confirmation_revisions,require_same_scope_version,metadata)
select id,project_id,
       case when lower(coalesce(connection_metadata->>'connection_kind','')) in ('databricks','postgresql','mssql','mysql') then 'CONFIRMED_ABSENCE' else 'MISSING_ONLY' end,
       2,true,
       jsonb_build_object('seeded_from_connection_kind',coalesce(nullif(lower(connection_metadata->>'connection_kind'),''),'unknown'))
from catalog.data_sources
on conflict(source_id) do nothing;

revoke all on function catalog.ensure_source_scope_version(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function catalog.ensure_source_scope_version(uuid,uuid,jsonb,uuid) to service_role;
revoke all on function catalog.seed_source_deletion_policy() from public,anon,authenticated;
