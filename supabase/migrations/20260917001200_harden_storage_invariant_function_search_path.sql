create or replace function catalog.enforce_dataset_version_storage_object_invariants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $$
declare
  dataset_project uuid;
  object_project uuid;
  object_state text;
begin
  if new.storage_object_id is null then
    return new;
  end if;

  select d.project_id
    into dataset_project
  from catalog.datasets d
  where d.id = new.dataset_id;

  if dataset_project is null then
    raise exception 'Dataset % does not exist or has no project.', new.dataset_id
      using errcode = '23503';
  end if;

  select so.project_id, so.state
    into object_project, object_state
  from catalog.storage_objects so
  where so.id = new.storage_object_id;

  if object_project is null then
    raise exception 'Storage object % does not exist.', new.storage_object_id
      using errcode = '23503';
  end if;

  if object_project <> dataset_project then
    raise exception 'Storage object project does not match dataset project.'
      using errcode = '23514';
  end if;

  if object_state <> 'READY' then
    raise exception 'Dataset versions may reference only READY storage objects.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function catalog.enforce_dataset_version_storage_object_invariants() from public;
