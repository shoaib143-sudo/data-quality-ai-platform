-- Close the direct Data API write path around governed glossary state.
-- Application mutations already flow through authenticated API routes that enforce
-- glossary.manage and then use the trusted server-side admin client.
-- Authenticated clients retain project-scoped read access only.

revoke insert, update, delete on table governance.glossary_terms from authenticated;
revoke insert, update, delete on table governance.glossary_mappings from authenticated;

drop policy if exists glossary_terms_project_access on governance.glossary_terms;
create policy glossary_terms_project_read
on governance.glossary_terms
for select
to authenticated
using (app_private.is_project_member(project_id));

drop policy if exists glossary_mappings_project_access on governance.glossary_mappings;
create policy glossary_mappings_project_read
on governance.glossary_mappings
for select
to authenticated
using (
  exists (
    select 1
    from governance.glossary_terms t
    where t.id = glossary_mappings.term_id
      and app_private.is_project_member(t.project_id)
  )
);

grant select on table governance.glossary_terms to authenticated;
grant select on table governance.glossary_mappings to authenticated;

-- Trusted server execution keeps its existing mutation authority.
grant select, insert, update, delete on table governance.glossary_terms to service_role;
grant select, insert, update, delete on table governance.glossary_mappings to service_role;
