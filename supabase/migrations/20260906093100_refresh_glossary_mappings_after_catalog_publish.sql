-- Keep catalog-bound business semantics aligned with the current physical catalog without
-- making derived glossary state a publication blocker.

create or replace function governance.refresh_glossary_mappings_after_catalog_revision()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform governance.refresh_glossary_mapping_validity(new.source_id);
  exception when others then
    -- Physical catalog truth remains authoritative even if the derived semantic mapping
    -- validity refresh encounters an operational error. The next revision will retry.
    raise warning 'Glossary mapping validity refresh failed for source %: %',new.source_id,sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function governance.refresh_glossary_mappings_after_catalog_revision() from public,anon,authenticated;

drop trigger if exists catalog_revision_refresh_glossary_mappings on catalog.catalog_revisions;
create trigger catalog_revision_refresh_glossary_mappings
after update of change_set_hash on catalog.catalog_revisions
for each row
when (old.change_set_hash is distinct from new.change_set_hash)
execute function governance.refresh_glossary_mappings_after_catalog_revision();

-- Normalize any catalog mappings that existed before this trigger was installed.
do $block$
declare
  v_source_id uuid;
begin
  for v_source_id in
    select distinct data_source_id
    from governance.glossary_mappings
    where target_type='CATALOG_ASSET' and data_source_id is not null
  loop
    perform governance.refresh_glossary_mapping_validity(v_source_id);
  end loop;
end;
$block$;
