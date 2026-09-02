-- Security hardening: SECURITY DEFINER helpers are server-side authorization primitives.
-- They must not be callable through the PostgREST API by public roles.
revoke execute on function app_private.is_org_admin(uuid) from anon, authenticated;
revoke execute on function app_private.is_org_member(uuid) from anon, authenticated;
revoke execute on function app_private.is_project_admin(uuid) from anon, authenticated;
revoke execute on function app_private.is_project_member(uuid) from anon, authenticated;
revoke execute on function public.create_file_dataset(uuid, text, text, text, text) from anon, authenticated;
revoke execute on function public.create_organization(text, text) from anon, authenticated;
revoke execute on function public.create_project(uuid, text, text, text) from anon, authenticated;
revoke execute on function public.get_dataset_version_for_profiling(uuid) from anon, authenticated;
