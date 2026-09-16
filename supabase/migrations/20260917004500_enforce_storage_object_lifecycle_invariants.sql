create or replace function catalog.enforce_storage_object_lifecycle_invariants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.provider is distinct from old.provider
     or new.bucket is distinct from old.bucket
     or new.object_key is distinct from old.object_key then
    raise exception 'Storage object identity fields are immutable after creation.';
  end if;

  if old.state = 'DELETED' and new.state <> 'DELETED' then
    raise exception 'Deleted storage objects cannot be restored in place.';
  end if;

  if old.state = 'READY' and new.state <> 'READY' and exists (
    select 1
    from catalog.dataset_versions dv
    where dv.storage_object_id = old.id
  ) then
    raise exception 'Referenced READY storage objects cannot leave READY state.';
  end if;

  return new;
end;
$$;

revoke all on function catalog.enforce_storage_object_lifecycle_invariants() from public;

drop trigger if exists trg_storage_objects_lifecycle_invariants on catalog.storage_objects;
create trigger trg_storage_objects_lifecycle_invariants
before update on catalog.storage_objects
for each row
execute function catalog.enforce_storage_object_lifecycle_invariants();

comment on function catalog.enforce_storage_object_lifecycle_invariants() is
  'Prevents storage identity retargeting, deleted-object resurrection, and referenced READY objects leaving READY state.';
