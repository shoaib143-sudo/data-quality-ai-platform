-- Allow authenticated users to evaluate organization membership through the
-- hardened internal SECURITY DEFINER helper used by app RLS policies.
-- Keep the function private and deny anonymous execution.

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION app_private.is_org_member(uuid) FROM anon;
