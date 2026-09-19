create or replace function catalog.enforce_r2_migration_copy_invariants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $$
declare
  source_id uuid;
  source_row catalog.storage_objects%rowtype;
begin
  if new.owner_type <> 'MIGRATION_COPY' then
    return new;
  end if;

  if new.provider <> 'r2' then
    raise exception 'MIGRATION_COPY objects must use the r2 provider.'
      using errcode = '23514';
  end if;

  begin
    source_id := nullif(new.metadata->>'source_storage_object_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'MIGRATION_COPY source_storage_object_id must be a valid UUID.'
      using errcode = '23514';
  end;

  if source_id is null then
    raise exception 'MIGRATION_COPY objects require source_storage_object_id metadata.'
      using errcode = '23514';
  end if;

  select * into source_row
  from catalog.storage_objects
  where id = source_id;

  if not found then
    raise exception 'MIGRATION_COPY source storage object does not exist.'
      using errcode = '23503';
  end if;

  if source_row.provider <> 'supabase' then
    raise exception 'MIGRATION_COPY source must be a Supabase storage object.'
      using errcode = '23514';
  end if;

  if source_row.project_id <> new.project_id then
    raise exception 'MIGRATION_COPY source and target projects must match.'
      using errcode = '23514';
  end if;

  if source_row.id = new.id then
    raise exception 'MIGRATION_COPY source and target objects must be distinct.'
      using errcode = '23514';
  end if;

  if new.state = 'READY' then
    if source_row.state <> 'READY' then
      raise exception 'READY MIGRATION_COPY requires a READY source object.'
        using errcode = '23514';
    end if;

    if new.size_bytes is null or source_row.size_bytes is null or new.size_bytes <> source_row.size_bytes then
      raise exception 'READY MIGRATION_COPY size must match source size.'
        using errcode = '23514';
    end if;

    if new.checksum_algorithm <> 'sha256' or new.checksum is null then
      raise exception 'READY MIGRATION_COPY requires a SHA-256 checksum.'
        using errcode = '23514';
    end if;

    if source_row.checksum_algorithm <> 'sha256' or source_row.checksum is null then
      raise exception 'READY MIGRATION_COPY requires a SHA-256-backed READY source object.'
        using errcode = '23514';
    end if;

    if source_row.checksum <> new.checksum then
      raise exception 'READY MIGRATION_COPY checksum must match source checksum.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function catalog.enforce_r2_migration_copy_invariants() from public;

comment on function catalog.enforce_r2_migration_copy_invariants() is
  'Fail-closed database boundary for R2 migration copies: same-project READY SHA-256-backed Supabase source with matching size and checksum before READY.';
