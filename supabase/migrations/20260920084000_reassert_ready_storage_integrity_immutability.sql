-- Reassert the terminal storage lifecycle contract after the later lifecycle migration
-- replaced the same trigger function with a narrower definition. This forward-only
-- migration keeps clean replay and live schema converged on the stronger READY
-- integrity boundary while preserving one-time SHA-256 enrichment for legacy READY objects.

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
    raise exception 'Storage object identity fields are immutable after creation.'
      using errcode = '23514';
  end if;

  if old.state = 'DELETED' and new.state <> 'DELETED' then
    raise exception 'Deleted storage objects cannot be restored in place.'
      using errcode = '23514';
  end if;

  if old.state = 'READY' and new.state <> 'READY' and exists (
    select 1
    from catalog.dataset_versions dv
    where dv.storage_object_id = old.id
  ) then
    raise exception 'Referenced READY storage objects cannot leave READY state.'
      using errcode = '23514';
  end if;

  if old.state = 'READY' and new.state = 'READY' then
    if new.size_bytes is distinct from old.size_bytes then
      raise exception 'READY storage object size is immutable.'
        using errcode = '23514';
    end if;

    if new.content_type is distinct from old.content_type then
      raise exception 'READY storage object content type is immutable.'
        using errcode = '23514';
    end if;

    if old.checksum is not null and (
      new.checksum is distinct from old.checksum
      or new.checksum_algorithm is distinct from old.checksum_algorithm
    ) then
      raise exception 'READY storage object checksum is immutable once established.'
        using errcode = '23514';
    end if;

    if old.checksum is null and new.checksum is not null then
      if new.checksum_algorithm <> 'sha256' then
        raise exception 'READY storage object checksum enrichment must use SHA-256.'
          using errcode = '23514';
      end if;
    elsif old.checksum is null and new.checksum is null
      and new.checksum_algorithm is distinct from old.checksum_algorithm then
      raise exception 'READY storage object checksum algorithm cannot change without a checksum.'
        using errcode = '23514';
    end if;

    if new.verified_at is null then
      raise exception 'READY storage object verification timestamp cannot be cleared.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function catalog.enforce_storage_object_lifecycle_invariants() from public;

comment on function catalog.enforce_storage_object_lifecycle_invariants() is
  'Enforces immutable storage identity and READY integrity metadata. A READY object may only enrich a previously absent checksum once, using SHA-256.';
