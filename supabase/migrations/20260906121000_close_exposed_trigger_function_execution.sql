-- SECURITY DEFINER trigger functions in PostgREST-exposed schemas must never be directly
-- invokable by application roles. Triggers continue to execute these functions internally.
revoke all on function governance.capture_glossary_term_version() from public, anon, authenticated, service_role;
revoke all on function governance.enforce_glossary_mapping_integrity() from public, anon, authenticated, service_role;
revoke all on function governance.on_catalog_revision_refresh_stewardship() from public, anon, authenticated, service_role;

-- Keep the database API security posture as the authoritative broad check so later
-- SECURITY DEFINER additions to governance/orchestration cannot silently become RPCs.
do $security_posture$
declare
  v_posture jsonb;
begin
  v_posture := governance.verify_database_api_security_posture();
  if coalesce((v_posture->>'valid')::boolean,false) is not true then
    raise exception 'Database API security posture remains invalid after trigger function hardening: %',v_posture;
  end if;
end;
$security_posture$;
