\set ON_ERROR_STOP on

create role authenticated;
create role service_role;

create schema governance;
create schema app_private;

create table governance.glossary_terms (
  id uuid primary key,
  project_id uuid not null,
  term text not null
);

create table governance.glossary_mappings (
  id uuid primary key,
  term_id uuid not null references governance.glossary_terms(id)
);

grant usage on schema governance to authenticated, service_role;
grant select, insert, update, delete on governance.glossary_terms, governance.glossary_mappings to authenticated, service_role;

revoke insert, update, delete on governance.glossary_terms, governance.glossary_mappings from authenticated;

do $$
begin
  if has_table_privilege('authenticated','governance.glossary_terms','INSERT')
     or has_table_privilege('authenticated','governance.glossary_terms','UPDATE')
     or has_table_privilege('authenticated','governance.glossary_terms','DELETE')
     or has_table_privilege('authenticated','governance.glossary_mappings','INSERT')
     or has_table_privilege('authenticated','governance.glossary_mappings','UPDATE')
     or has_table_privilege('authenticated','governance.glossary_mappings','DELETE') then
    raise exception 'authenticated retained a direct glossary mutation privilege';
  end if;

  if not has_table_privilege('authenticated','governance.glossary_terms','SELECT')
     or not has_table_privilege('authenticated','governance.glossary_mappings','SELECT') then
    raise exception 'authenticated glossary read privilege was removed';
  end if;

  if not has_table_privilege('service_role','governance.glossary_terms','INSERT')
     or not has_table_privilege('service_role','governance.glossary_terms','UPDATE')
     or not has_table_privilege('service_role','governance.glossary_terms','DELETE')
     or not has_table_privilege('service_role','governance.glossary_mappings','INSERT')
     or not has_table_privilege('service_role','governance.glossary_mappings','UPDATE')
     or not has_table_privilege('service_role','governance.glossary_mappings','DELETE') then
    raise exception 'trusted service mutation authority was unexpectedly removed';
  end if;
end
$$;

select 'glossary direct-write privilege boundary: PASS' as result;
