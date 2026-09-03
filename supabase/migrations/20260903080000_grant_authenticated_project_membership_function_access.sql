-- Allow authenticated users to evaluate project membership through the
-- hardened internal SECURITY DEFINER helper used by app RLS policies.
-- Keep the function private and deny anonymous execution.

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_project_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION app_private.is_project_member(uuid) FROM anon;
