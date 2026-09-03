-- RLS policies call these internal SECURITY DEFINER membership helpers.
-- Authenticated users therefore need EXECUTE while anonymous users remain denied.
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_project_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_project_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION app_private.is_org_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION app_private.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION app_private.is_project_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION app_private.is_project_member(uuid) FROM anon;
