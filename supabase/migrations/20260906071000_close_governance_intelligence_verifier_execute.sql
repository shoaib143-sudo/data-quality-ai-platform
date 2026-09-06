-- Keep the active governance-intelligence verifier service-only.
-- It is SECURITY DEFINER and is invoked by trusted server-side/admin paths, so
-- authenticated browser clients do not need EXECUTE on the exposed governance schema.

revoke all on function governance.verify_ai_governance_intelligence_active(uuid) from public, anon, authenticated;
grant execute on function governance.verify_ai_governance_intelligence_active(uuid) to service_role;
