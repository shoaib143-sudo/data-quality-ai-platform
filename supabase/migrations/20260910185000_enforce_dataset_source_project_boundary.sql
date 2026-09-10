-- A dataset may only bind to a data source owned by the same project.
-- Keep the existing FK's ON DELETE SET NULL behavior while enforcing the
-- project boundary on inserts and updates.

create or replace function catalog.enforce_dataset_source_project_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $$
declare
  v_source_project_id uuid;
begin
  if new.data_source_id is null then
    return new;
  end if;

  select ds.project_id
    into v_source_project_id
  from catalog.data_sources ds
  where ds.id = new.data_source_id;

  if v_source_project_id is null then
    raise exception 'dataset data source % does not exist', new.data_source_id
      using errcode = '23503';
  end if;

  if v_source_project_id <> new.project_id then
    raise exception 'dataset and data source must belong to the same project'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function catalog.enforce_dataset_source_project_boundary() from public, anon, authenticated;
grant execute on function catalog.enforce_dataset_source_project_boundary() to service_role;

do $$
begin
  if exists (
    select 1
    from catalog.datasets d
    join catalog.data_sources ds on ds.id = d.data_source_id
    where d.project_id <> ds.project_id
  ) then
    raise exception 'cannot enforce dataset/source project boundary: cross-project bindings exist';
  end if;
end;
$$;

drop trigger if exists datasets_enforce_source_project_boundary on catalog.datasets;
create trigger datasets_enforce_source_project_boundary
before insert or update of data_source_id, project_id on catalog.datasets
for each row
execute function catalog.enforce_dataset_source_project_boundary();
