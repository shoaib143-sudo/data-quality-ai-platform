\set ON_ERROR_STOP on

do $$
declare
  v_all_policy_count integer;
begin
  if has_table_privilege('authenticated','governance.glossary_terms','INSERT')
     or has_table_privilege('authenticated','governance.glossary_terms','UPDATE')
     or has_table_privilege('authenticated','governance.glossary_terms','DELETE')
     or has_table_privilege('authenticated','governance.glossary_mappings','INSERT')
     or has_table_privilege('authenticated','governance.glossary_mappings','UPDATE')
     or has_table_privilege('authenticated','governance.glossary_mappings','DELETE') then
    raise exception 'authenticated retains direct glossary mutation privileges after clean migration replay';
  end if;

  if not has_table_privilege('authenticated','governance.glossary_terms','SELECT')
     or not has_table_privilege('authenticated','governance.glossary_mappings','SELECT') then
    raise exception 'authenticated glossary read access is missing after clean migration replay';
  end if;

  if not has_table_privilege('service_role','governance.glossary_terms','INSERT')
     or not has_table_privilege('service_role','governance.glossary_terms','UPDATE')
     or not has_table_privilege('service_role','governance.glossary_terms','DELETE')
     or not has_table_privilege('service_role','governance.glossary_mappings','INSERT')
     or not has_table_privilege('service_role','governance.glossary_mappings','UPDATE')
     or not has_table_privilege('service_role','governance.glossary_mappings','DELETE') then
    raise exception 'trusted service role glossary mutation privileges are incomplete';
  end if;

  select count(*) into v_all_policy_count
  from pg_policies
  where schemaname='governance'
    and tablename in ('glossary_terms','glossary_mappings')
    and 'authenticated'=any(roles)
    and cmd='ALL';

  if v_all_policy_count <> 0 then
    raise exception 'authenticated ALL glossary policies remain after hardening: %', v_all_policy_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='governance'
      and tablename='glossary_terms'
      and policyname='glossary_terms_project_read'
      and cmd='SELECT'
      and 'authenticated'=any(roles)
  ) then
    raise exception 'glossary_terms_project_read policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='governance'
      and tablename='glossary_mappings'
      and policyname='glossary_mappings_project_read'
      and cmd='SELECT'
      and 'authenticated'=any(roles)
  ) then
    raise exception 'glossary_mappings_project_read policy is missing';
  end if;
end
$$;

select 'Clean reconstructed glossary direct-write boundary: PASS' as result;
