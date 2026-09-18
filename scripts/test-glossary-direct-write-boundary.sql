\set ON_ERROR_STOP on

-- This test runs after test-production-security-posture.sql in the same database.
-- Reuse shared roles when they already exist, but isolate all objects in a
-- dedicated schema so the test is independently rerunnable and cannot collide
-- with the preceding security posture fixture.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role';
  end if;
end
$$;

drop schema if exists glossary_boundary_test cascade;
create schema glossary_boundary_test;

create table glossary_boundary_test.glossary_terms (
  id uuid primary key,
  project_id uuid not null,
  term text not null
);

create table glossary_boundary_test.glossary_mappings (
  id uuid primary key,
  term_id uuid not null references glossary_boundary_test.glossary_terms(id)
);

grant usage on schema glossary_boundary_test to authenticated, service_role;
grant select, insert, update, delete
  on glossary_boundary_test.glossary_terms, glossary_boundary_test.glossary_mappings
  to authenticated, service_role;

revoke insert, update, delete
  on glossary_boundary_test.glossary_terms, glossary_boundary_test.glossary_mappings
  from authenticated;

do $$
begin
  if has_table_privilege('authenticated','glossary_boundary_test.glossary_terms','INSERT')
     or has_table_privilege('authenticated','glossary_boundary_test.glossary_terms','UPDATE')
     or has_table_privilege('authenticated','glossary_boundary_test.glossary_terms','DELETE')
     or has_table_privilege('authenticated','glossary_boundary_test.glossary_mappings','INSERT')
     or has_table_privilege('authenticated','glossary_boundary_test.glossary_mappings','UPDATE')
     or has_table_privilege('authenticated','glossary_boundary_test.glossary_mappings','DELETE') then
    raise exception 'authenticated retained a direct glossary mutation privilege';
  end if;

  if not has_table_privilege('authenticated','glossary_boundary_test.glossary_terms','SELECT')
     or not has_table_privilege('authenticated','glossary_boundary_test.glossary_mappings','SELECT') then
    raise exception 'authenticated glossary read privilege was removed';
  end if;

  if not has_table_privilege('service_role','glossary_boundary_test.glossary_terms','INSERT')
     or not has_table_privilege('service_role','glossary_boundary_test.glossary_terms','UPDATE')
     or not has_table_privilege('service_role','glossary_boundary_test.glossary_terms','DELETE')
     or not has_table_privilege('service_role','glossary_boundary_test.glossary_mappings','INSERT')
     or not has_table_privilege('service_role','glossary_boundary_test.glossary_mappings','UPDATE')
     or not has_table_privilege('service_role','glossary_boundary_test.glossary_mappings','DELETE') then
    raise exception 'trusted service mutation authority was unexpectedly removed';
  end if;
end
$$;

drop schema glossary_boundary_test cascade;

select 'glossary direct-write privilege boundary: PASS' as result;
