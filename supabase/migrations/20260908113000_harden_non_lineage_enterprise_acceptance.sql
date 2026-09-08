-- Close three independently observed non-lineage production acceptance gaps without
-- mutating historical governance evidence:
-- 1. keep internal dependency propagation SECURITY DEFINER RPC out of browser roles;
-- 2. evaluate JDBC/catalog acceptance against the active published scope, not historical
--    discovered assets that are now OUT_OF_SCOPE;
-- 3. preserve the cryptographically-valid v2 audit fork as historical evidence and
--    roll new audit writes onto a strict serialized v3 chain.

-- -----------------------------------------------------------------------------
-- Durable queue internal privilege boundary
-- -----------------------------------------------------------------------------
revoke all on function orchestration.resolve_failed_job_dependencies() from public;
revoke execute on function orchestration.resolve_failed_job_dependencies() from anon, authenticated;

-- claim_jobs() and claim_job_by_agent_run() invoke this helper under their own
-- controlled SECURITY DEFINER boundary. Browser roles must never invoke it directly.

-- -----------------------------------------------------------------------------
-- Scope-aware JDBC source acceptance
-- -----------------------------------------------------------------------------
create or replace function catalog.verify_jdbc_source_acceptance(
  p_source_id uuid,
  p_require_multi_namespace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source catalog.data_sources%rowtype;
  v_latest_run catalog.discovery_runs%rowtype;
  v_latest_revision catalog.catalog_revisions%rowtype;
  v_previous_revision catalog.catalog_revisions%rowtype;
  v_scope_version catalog.source_scope_versions%rowtype;
  v_config jsonb := '{}'::jsonb;
  v_config_without_refs jsonb := '{}'::jsonb;
  v_manifest jsonb := '{}'::jsonb;
  v_jdbc_url text;
  v_credential_ref text;
  v_source_exists boolean := false;
  v_source_active boolean := false;
  v_source_jdbc boolean := false;
  v_connection_configured boolean := false;
  v_inline_secret_risk boolean := false;
  v_url_secret_risk boolean := false;
  v_latest_discovery_complete boolean := false;
  v_manifest_complete boolean := false;
  v_repeat_scan_evidence_present boolean := false;
  v_repeat_scan_stable boolean := false;
  v_scope_frozen boolean := false;
  v_current_assets bigint := 0;
  v_current_fields bigint := 0;
  v_namespace_count bigint := 0;
  v_current_identity_count bigint := 0;
  v_distinct_identity_count bigint := 0;
  v_null_identity_count bigint := 0;
  v_catalog_source_assets bigint := 0;
  v_total_physical_versions bigint := 0;
  v_multi_namespace_ok boolean := false;
  v_valid boolean := false;
begin
  select * into v_source
  from catalog.data_sources
  where id = p_source_id;

  v_source_exists := found;
  if not v_source_exists then
    return jsonb_build_object(
      'valid', false,
      'source_id', p_source_id,
      'checks', jsonb_build_object('source_exists', false),
      'state', 'SOURCE_NOT_FOUND'
    );
  end if;

  v_source_active := v_source.status::text = 'ACTIVE';
  v_source_jdbc := v_source.source_type::text = 'JDBC';
  v_config := coalesce(v_source.connection_metadata, '{}'::jsonb);
  v_jdbc_url := coalesce(
    nullif(btrim(v_config->>'jdbc_url'), ''),
    nullif(btrim(v_config->>'jdbcUrl'), ''),
    nullif(btrim(v_config->>'url'), '')
  );
  v_credential_ref := coalesce(
    nullif(btrim(v_config->>'credential_ref'), ''),
    nullif(btrim(v_config->>'credentialRef'), ''),
    nullif(btrim(v_config->>'secret_ref'), ''),
    nullif(btrim(v_config->>'secretRef'), '')
  );
  v_connection_configured := v_jdbc_url is not null and v_credential_ref is not null;

  v_config_without_refs := v_config - array['credential_ref','credentialRef','secret_ref','secretRef'];
  v_inline_secret_risk := v_config_without_refs::text ~* '\"(username|user|password|passwd|pwd|token|access_token|secret|client_secret)\"[[:space:]]*:';
  v_url_secret_risk := coalesce(v_jdbc_url, '') ~* '([?;&](user(name)?|password|passwd|pwd|token|access[_-]?token|secret)=|://[^/@:]+:[^/@]+@)';

  select * into v_latest_run
  from catalog.discovery_runs
  where source_id = p_source_id
    and status::text = 'COMPLETED'
  order by completed_at desc nulls last, started_at desc nulls last
  limit 1;

  if found then
    v_latest_discovery_complete := true;
    v_manifest := coalesce(v_latest_run.schema_snapshot->'discovery_manifest', '{}'::jsonb);
    v_manifest_complete := coalesce((v_manifest->>'complete')::boolean, false)
      and not coalesce((v_manifest->>'truncated')::boolean, false)
      and coalesce((v_manifest->>'failed_item_count')::bigint, 0) = 0
      and coalesce((v_manifest->>'expected_object_count')::bigint, -1) = coalesce((v_manifest->>'observed_object_count')::bigint, -2)
      and coalesce((v_manifest->>'expected_field_count')::bigint, -1) = coalesce((v_manifest->>'observed_field_count')::bigint, -2);

    if v_latest_run.scope_version_id is not null then
      select * into v_scope_version
      from catalog.source_scope_versions
      where id = v_latest_run.scope_version_id;
      v_scope_frozen := found;
    end if;
  end if;

  -- current_catalog_source_assets is the authoritative active-scope projection.
  -- Joining back to discovered_assets retains stable identity evidence without
  -- re-introducing OUT_OF_SCOPE assets from earlier wider scans.
  select
    count(*),
    coalesce(sum(jsonb_array_length(coalesce(ca.columns, '[]'::jsonb))), 0),
    count(distinct ca.namespace) filter (where ca.namespace is not null and btrim(ca.namespace) <> ''),
    count(da.identity_key),
    count(distinct da.identity_key),
    count(*) filter (where da.identity_key is null or btrim(da.identity_key) = '')
  into
    v_current_assets,
    v_current_fields,
    v_namespace_count,
    v_current_identity_count,
    v_distinct_identity_count,
    v_null_identity_count
  from catalog.current_catalog_source_assets ca
  join catalog.discovered_assets da on da.id = ca.id
  where ca.source_id = p_source_id;

  select count(*) into v_total_physical_versions
  from catalog.discovered_asset_versions
  where source_id = p_source_id;

  select count(*) into v_catalog_source_assets
  from catalog.current_catalog_source_assets
  where source_id = p_source_id;

  select * into v_latest_revision
  from catalog.catalog_revisions
  where source_id = p_source_id
  order by revision_number desc
  limit 1;

  if found then
    select * into v_previous_revision
    from catalog.catalog_revisions
    where source_id = p_source_id
      and revision_number < v_latest_revision.revision_number
    order by revision_number desc
    limit 1;

    v_repeat_scan_evidence_present := found;
    if v_repeat_scan_evidence_present then
      v_repeat_scan_stable := coalesce(v_latest_revision.objects_added, 0) = 0
        and coalesce(v_latest_revision.objects_changed, 0) = 0
        and coalesce(v_latest_revision.objects_missing, 0) = 0
        and coalesce(v_latest_revision.objects_removed, 0) = 0
        and coalesce(v_latest_revision.objects_unchanged, 0) = coalesce(v_latest_revision.objects_observed, 0);
    end if;
  end if;

  v_multi_namespace_ok := not p_require_multi_namespace or v_namespace_count > 1;

  v_valid := v_source_active
    and v_source_jdbc
    and v_connection_configured
    and not v_inline_secret_risk
    and not v_url_secret_risk
    and v_latest_discovery_complete
    and v_manifest_complete
    and v_scope_frozen
    and v_current_assets > 0
    and v_current_fields > 0
    and v_current_identity_count = v_current_assets
    and v_distinct_identity_count = v_current_assets
    and v_null_identity_count = 0
    and v_catalog_source_assets = v_current_assets
    and v_total_physical_versions >= v_current_assets
    and v_repeat_scan_evidence_present
    and v_repeat_scan_stable
    and v_multi_namespace_ok;

  return jsonb_build_object(
    'valid', v_valid,
    'source_id', p_source_id,
    'state', case when v_valid then 'GENERIC_JDBC_ACCEPTANCE_PASSED' else 'GENERIC_JDBC_ACCEPTANCE_INCOMPLETE' end,
    'checks', jsonb_build_object(
      'source_exists', v_source_exists,
      'source_active', v_source_active,
      'source_type_jdbc', v_source_jdbc,
      'connection_reference_configured', v_connection_configured,
      'no_inline_secret_material', not v_inline_secret_risk,
      'no_secret_material_in_jdbc_url', not v_url_secret_risk,
      'latest_discovery_completed', v_latest_discovery_complete,
      'discovery_manifest_complete', v_manifest_complete,
      'scope_frozen', v_scope_frozen,
      'objects_discovered', v_current_assets > 0,
      'fields_discovered', v_current_fields > 0,
      'identity_unique_and_complete', v_current_identity_count = v_current_assets and v_distinct_identity_count = v_current_assets and v_null_identity_count = 0,
      'catalog_projection_complete', v_catalog_source_assets = v_current_assets,
      'physical_version_evidence_present', v_total_physical_versions >= v_current_assets,
      'repeat_scan_evidence_present', v_repeat_scan_evidence_present,
      'repeat_scan_stable', v_repeat_scan_stable,
      'multi_namespace_requirement_satisfied', v_multi_namespace_ok
    ),
    'discovery', jsonb_build_object(
      'objects', v_current_assets,
      'fields', v_current_fields,
      'namespaces', v_namespace_count,
      'latest_run_id', v_latest_run.id,
      'manifest_complete', v_manifest_complete
    ),
    'catalog', jsonb_build_object(
      'published_source_assets', v_catalog_source_assets,
      'current_identity_count', v_current_identity_count,
      'distinct_identity_count', v_distinct_identity_count,
      'total_physical_versions', v_total_physical_versions
    ),
    'repeatability', jsonb_build_object(
      'evidence_present', v_repeat_scan_evidence_present,
      'stable', v_repeat_scan_stable,
      'latest_revision_number', v_latest_revision.revision_number,
      'previous_revision_number', v_previous_revision.revision_number,
      'objects_observed', v_latest_revision.objects_observed,
      'objects_added', v_latest_revision.objects_added,
      'objects_changed', v_latest_revision.objects_changed,
      'objects_missing', v_latest_revision.objects_missing,
      'objects_removed', v_latest_revision.objects_removed,
      'objects_unchanged', v_latest_revision.objects_unchanged
    ),
    'scope', jsonb_build_object(
      'scope_version_id', v_scope_version.id,
      'scope_version_number', v_scope_version.version_number,
      'selection_mode', coalesce(v_scope_version.native_selection->>'mode', 'UNKNOWN'),
      'include_system', coalesce((v_scope_version.native_selection->>'includeSystem')::boolean, false),
      'inherit_future_children', coalesce((v_scope_version.native_selection->>'inheritFutureChildren')::boolean, false),
      'multi_namespace_required', p_require_multi_namespace
    ),
    'security', jsonb_build_object(
      'credential_reference_configured', v_credential_ref is not null,
      'inline_secret_material_detected', v_inline_secret_risk,
      'jdbc_url_secret_material_detected', v_url_secret_risk
    )
  );
end;
$function$;

-- Preserve the existing service-only RPC boundary.
revoke all on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from public;
revoke execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from anon, authenticated;
grant execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- Scope-aware project enterprise acceptance base
-- -----------------------------------------------------------------------------
create or replace function governance.verify_non_lineage_enterprise_acceptance_base(p_project_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_glossary jsonb := governance.verify_glossary_evidence_posture();
  v_stewardship jsonb := governance.verify_stewardship_governance_posture();
  v_classification jsonb := governance.verify_classification_privacy_posture();
  v_quality jsonb := governance.verify_quality_control_posture();
  v_workflow jsonb := governance.verify_workflow_contract_posture();
  v_audit_reporting jsonb := governance.verify_audit_reporting_posture();
  v_ai_assisted jsonb := governance.verify_ai_assisted_governance_posture();
  v_governance_intelligence jsonb := governance.verify_governance_intelligence_posture();
  v_autonomous_agent jsonb := governance.verify_autonomous_agent_posture();
  v_ai_system jsonb := governance.verify_ai_system_governance_posture();
  v_semantic jsonb := governance.verify_semantic_search_posture();
  v_security jsonb := governance.verify_database_api_security_posture();
  v_audit_chain jsonb := governance.verify_audit_chain(p_project_id);
  v_active_intelligence jsonb := governance.verify_ai_governance_intelligence_active(p_project_id);
  v_platform_contract_status text;
  v_observed_sources bigint := 0;
  v_complete_manifest_sources bigint := 0;
  v_current_assets bigint := 0;
  v_current_fields bigint := 0;
  v_identity_count bigint := 0;
  v_distinct_identity_count bigint := 0;
  v_null_identity_count bigint := 0;
  v_physical_versions bigint := 0;
  v_projected_assets bigint := 0;
  v_observed_jdbc_sources bigint := 0;
  v_accepted_jdbc_sources bigint := 0;
  v_multi_namespace_evidence boolean := false;
  v_lineage_boundary_valid boolean := false;
  v_corpus_boundary_valid boolean := false;
  v_valid boolean := false;
begin
  select status::text into v_platform_contract_status
  from governance.platform_contract_check_runs
  where project_id is not distinct from p_project_id
  order by completed_at desc nulls last
  limit 1;

  with observed as (
    select s.id
    from catalog.data_sources s
    where s.project_id = p_project_id
      and s.status::text = 'ACTIVE'
      and exists (
        select 1 from catalog.current_catalog_source_assets a where a.source_id = s.id
      )
      and exists (
        select 1 from catalog.discovery_runs r
        where r.source_id = s.id and r.status::text = 'COMPLETED'
      )
  ), latest_runs as (
    select distinct on (r.source_id) r.source_id, r.schema_snapshot
    from catalog.discovery_runs r
    join observed o on o.id = r.source_id
    where r.status::text = 'COMPLETED'
    order by r.source_id, r.completed_at desc nulls last, r.started_at desc nulls last
  ), current_assets as (
    select ca.*, da.identity_key
    from catalog.current_catalog_source_assets ca
    join observed o on o.id = ca.source_id
    join catalog.discovered_assets da on da.id = ca.id
  )
  select
    (select count(*) from observed),
    (select count(*) from latest_runs lr
      where coalesce((lr.schema_snapshot->'discovery_manifest'->>'complete')::boolean, false)
        and not coalesce((lr.schema_snapshot->'discovery_manifest'->>'truncated')::boolean, false)
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'failed_item_count')::bigint, 0) = 0
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'expected_object_count')::bigint, -1)
          = coalesce((lr.schema_snapshot->'discovery_manifest'->>'observed_object_count')::bigint, -2)
        and coalesce((lr.schema_snapshot->'discovery_manifest'->>'expected_field_count')::bigint, -1)
          = coalesce((lr.schema_snapshot->'discovery_manifest'->>'observed_field_count')::bigint, -2)),
    (select count(*) from current_assets),
    (select coalesce(sum(jsonb_array_length(coalesce(columns, '[]'::jsonb))), 0) from current_assets),
    (select count(identity_key) from current_assets),
    (select count(distinct (source_id, identity_key)) from current_assets),
    (select count(*) from current_assets where identity_key is null or btrim(identity_key) = ''),
    (select count(*) from catalog.discovered_asset_versions av join observed o on o.id = av.source_id),
    (select count(*) from current_assets)
  into
    v_observed_sources,
    v_complete_manifest_sources,
    v_current_assets,
    v_current_fields,
    v_identity_count,
    v_distinct_identity_count,
    v_null_identity_count,
    v_physical_versions,
    v_projected_assets;

  with observed_jdbc as (
    select s.id
    from catalog.data_sources s
    where s.project_id = p_project_id
      and s.status::text = 'ACTIVE'
      and s.source_type::text = 'JDBC'
      and exists (select 1 from catalog.current_catalog_source_assets a where a.source_id = s.id)
      and exists (select 1 from catalog.discovery_runs r where r.source_id = s.id and r.status::text = 'COMPLETED')
  ), acceptance as (
    select j.id, catalog.verify_jdbc_source_acceptance(j.id, false) as evidence
    from observed_jdbc j
  )
  select
    count(*),
    count(*) filter (where coalesce((evidence->>'valid')::boolean, false)),
    coalesce(bool_or(
      coalesce((evidence->>'valid')::boolean, false)
      and coalesce((evidence->'discovery'->>'namespaces')::bigint, 0) > 1
    ), false)
  into v_observed_jdbc_sources, v_accepted_jdbc_sources, v_multi_namespace_evidence
  from acceptance;

  v_lineage_boundary_valid :=
    coalesce(v_active_intelligence->>'status', '') = 'PARTIAL'
    and coalesce((v_active_intelligence->>'failure_count')::bigint, -1) = 0
    and coalesce((v_active_intelligence->>'partial_or_external_count')::bigint, -1) = 1
    and jsonb_typeof(coalesce(v_active_intelligence->'blockers', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(v_active_intelligence->'blockers', '[]'::jsonb)) = 1
    and v_active_intelligence->'blockers'->0->>'code' = 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED';

  v_corpus_boundary_valid :=
    v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'status' = 'PASS'
    and coalesce((v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'external_reference_documents')::bigint, 0) > 0
    and not coalesce((v_active_intelligence->'checks'->'enterprise_governance_corpus'->>'external_references_confer_internal_authority')::boolean, true);

  v_valid :=
    p_project_id is not null
    and coalesce((v_glossary->>'valid')::boolean, false)
    and coalesce((v_stewardship->>'valid')::boolean, false)
    and coalesce((v_classification->>'valid')::boolean, false)
    and coalesce((v_quality->>'valid')::boolean, false)
    and coalesce((v_workflow->>'valid')::boolean, false)
    and coalesce((v_audit_reporting->>'valid')::boolean, false)
    and coalesce((v_ai_assisted->>'valid')::boolean, false)
    and coalesce((v_governance_intelligence->>'valid')::boolean, false)
    and coalesce((v_autonomous_agent->>'valid')::boolean, false)
    and coalesce((v_ai_system->>'valid')::boolean, false)
    and coalesce((v_semantic->>'valid')::boolean, false)
    and coalesce((v_security->>'valid')::boolean, false)
    and coalesce((v_audit_chain->>'valid')::boolean, false)
    and v_platform_contract_status = 'PASSED'
    and v_observed_sources > 0
    and v_complete_manifest_sources = v_observed_sources
    and v_current_assets > 0
    and v_current_fields > 0
    and v_identity_count = v_current_assets
    and v_distinct_identity_count = v_current_assets
    and v_null_identity_count = 0
    and v_physical_versions >= v_current_assets
    and v_projected_assets = v_current_assets
    and v_observed_jdbc_sources > 0
    and v_accepted_jdbc_sources = v_observed_jdbc_sources
    and v_multi_namespace_evidence
    and v_lineage_boundary_valid
    and v_corpus_boundary_valid
    and v_active_intelligence->'checks'->'contracts_certification'->>'status' = 'PASS';

  return jsonb_build_object(
    'valid', v_valid,
    'state', case when v_valid then 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED' else 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_INCOMPLETE' end,
    'project_id', p_project_id,
    'scope', jsonb_build_object(
      'included_modules', jsonb_build_array(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
      'excluded_modules', jsonb_build_array(3),
      'module_3', jsonb_build_object(
        'included', false,
        'state', 'BLOCKED_EXTERNAL',
        'blocker', 'DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED',
        'required_privilege', 'USE SCHEMA on system.access',
        'data_blocker', 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED',
        'inference_allowed', false
      )
    ),
    'catalog', jsonb_build_object(
      'observed_sources', v_observed_sources,
      'complete_manifest_sources', v_complete_manifest_sources,
      'current_assets', v_current_assets,
      'current_fields', v_current_fields,
      'identity_count', v_identity_count,
      'distinct_identity_count', v_distinct_identity_count,
      'null_identity_count', v_null_identity_count,
      'physical_versions', v_physical_versions,
      'projected_assets', v_projected_assets,
      'identity_and_versioning_valid',
        v_identity_count = v_current_assets
        and v_distinct_identity_count = v_current_assets
        and v_null_identity_count = 0
        and v_physical_versions >= v_current_assets
        and v_projected_assets = v_current_assets
    ),
    'jdbc', jsonb_build_object(
      'observed_sources', v_observed_jdbc_sources,
      'accepted_sources', v_accepted_jdbc_sources,
      'all_observed_sources_accepted', v_observed_jdbc_sources > 0 and v_accepted_jdbc_sources = v_observed_jdbc_sources,
      'multi_namespace_evidence', v_multi_namespace_evidence
    ),
    'governance', jsonb_build_object(
      'module_4_glossary', coalesce((v_glossary->>'valid')::boolean, false),
      'module_5_stewardship', coalesce((v_stewardship->>'valid')::boolean, false),
      'module_6_classification_privacy', coalesce((v_classification->>'valid')::boolean, false),
      'module_7_quality', coalesce((v_quality->>'valid')::boolean, false),
      'module_8_policy_controls', coalesce((v_quality->>'valid')::boolean, false) and v_platform_contract_status = 'PASSED',
      'module_9_workflow_remediation', coalesce((v_workflow->>'valid')::boolean, false),
      'module_10_contract_change_governance', coalesce((v_workflow->>'valid')::boolean, false) and v_active_intelligence->'checks'->'contracts_certification'->>'status' = 'PASS',
      'module_11_audit_evidence_reporting', coalesce((v_audit_reporting->>'valid')::boolean, false) and coalesce((v_audit_chain->>'valid')::boolean, false),
      'module_12_ai_assisted_governance', coalesce((v_ai_assisted->>'valid')::boolean, false),
      'module_13_governance_intelligence', coalesce((v_governance_intelligence->>'valid')::boolean, false),
      'module_14_autonomous_agents', coalesce((v_autonomous_agent->>'valid')::boolean, false),
      'module_15_ai_system_governance', coalesce((v_ai_system->>'valid')::boolean, false),
      'semantic_search', coalesce((v_semantic->>'valid')::boolean, false),
      'platform_contract_status', coalesce(v_platform_contract_status, 'MISSING'),
      'database_api_security', coalesce((v_security->>'valid')::boolean, false),
      'audit_chain', coalesce((v_audit_chain->>'valid')::boolean, false),
      'external_corpus_truth_boundary', v_corpus_boundary_valid
    ),
    'lineage_boundary', jsonb_build_object(
      'valid', v_lineage_boundary_valid,
      'expected_status', 'PARTIAL',
      'failure_count', v_active_intelligence->'failure_count',
      'partial_or_external_count', v_active_intelligence->'partial_or_external_count',
      'blockers', v_active_intelligence->'blockers'
    )
  );
end;
$function$;

revoke all on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) from public;
revoke execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) from anon, authenticated;
grant execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Audit chain v3: strict new writes, preserved v2 historical fork evidence
-- -----------------------------------------------------------------------------
alter table governance.audit_events alter column chain_version set default 3;

create or replace function governance.prepare_audit_event_hash()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance'
as $function$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.project_id::text,'GLOBAL'),0));

  if new.chain_version is null then
    new.chain_version := 3;
  end if;
  if new.chain_sequence is null then
    new.chain_sequence := nextval('governance.audit_event_chain_sequence');
  end if;

  if new.chain_version >= 2 then
    select event_hash into v_prev
    from governance.audit_events
    where project_id is not distinct from new.project_id
      and chain_version = new.chain_version
      and event_hash is not null
    order by chain_sequence desc
    limit 1;
  else
    select event_hash into v_prev
    from governance.audit_events
    where project_id is not distinct from new.project_id
      and chain_version = new.chain_version
      and event_hash is not null
    order by created_at desc,id desc
    limit 1;
  end if;

  new.previous_hash := v_prev;
  new.event_hash := governance.compute_audit_event_hash(
    v_prev,new.id,new.project_id,new.actor_user_id,new.actor_type,new.event_type,
    new.entity_type,new.entity_id,new.correlation_id,new.metadata,new.created_at
  );
  return new;
end;
$function$;

revoke all on function governance.prepare_audit_event_hash() from public;
revoke execute on function governance.prepare_audit_event_hash() from anon, authenticated;

create or replace function governance.verify_audit_chain(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance'
as $function$
declare
  r record;
  v_project_marker text := null;
  v_chain_version smallint := null;
  v_prev text := null;
  v_expected text;
  v_checked integer := 0;
  v_failures integer := 0;
  v_legacy_checked integer := 0;
  v_legacy_failures integer := 0;
  v_v2_checked integer := 0;
  v_v2_failures integer := 0;
  v_v2_forks integer := 0;
  v_strict_checked integer := 0;
  v_strict_failures integer := 0;
  v_legacy_forks integer := 0;
begin
  -- v1 is the original predecessor-presence contract.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash
    from governance.audit_events
    where chain_version = 1
      and (p_project_id is null or project_id=p_project_id)
  loop
    v_expected := governance.compute_audit_event_hash(
      r.previous_hash,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_legacy_checked := v_legacy_checked + 1;
    if r.event_hash is distinct from v_expected
       or (r.previous_hash is not null and not exists (
         select 1 from governance.audit_events p
         where p.chain_version = 1
           and p.project_id is not distinct from r.project_id
           and p.event_hash = r.previous_hash
       )) then
      v_failures := v_failures + 1;
      v_legacy_failures := v_legacy_failures + 1;
    end if;
  end loop;

  select count(*) into v_legacy_forks
  from (
    select project_id, previous_hash
    from governance.audit_events
    where chain_version = 1
      and previous_hash is not null
      and (p_project_id is null or project_id=p_project_id)
    group by project_id, previous_hash
    having count(*) > 1
  ) forks;

  -- v2 was deployed before project-scoped advisory serialization. Preserve every
  -- immutable row and verify its cryptographic digest and predecessor existence.
  -- Historical forks are reported, not rewritten and not mislabeled as tampering.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash
    from governance.audit_events
    where chain_version = 2
      and (p_project_id is null or project_id=p_project_id)
  loop
    v_expected := governance.compute_audit_event_hash(
      r.previous_hash,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_v2_checked := v_v2_checked + 1;
    if r.event_hash is distinct from v_expected
       or (r.previous_hash is not null and not exists (
         select 1 from governance.audit_events p
         where p.chain_version = 2
           and p.project_id is not distinct from r.project_id
           and p.event_hash = r.previous_hash
       )) then
      v_failures := v_failures + 1;
      v_v2_failures := v_v2_failures + 1;
    end if;
  end loop;

  select count(*) into v_v2_forks
  from (
    select project_id, previous_hash
    from governance.audit_events
    where chain_version = 2
      and previous_hash is not null
      and (p_project_id is null or project_id=p_project_id)
    group by project_id, previous_hash
    having count(*) > 1
  ) forks;

  -- v3+ is strictly serialized and must be a single linear sequence per project/version.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash,chain_version,chain_sequence
    from governance.audit_events
    where chain_version >= 3
      and (p_project_id is null or project_id=p_project_id)
    order by coalesce(project_id::text,''),chain_version,chain_sequence
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'')
       or v_chain_version is distinct from r.chain_version then
      v_project_marker := coalesce(r.project_id::text,'');
      v_chain_version := r.chain_version;
      v_prev := null;
    end if;

    v_expected := governance.compute_audit_event_hash(
      v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_strict_checked := v_strict_checked + 1;
    if r.chain_sequence is null
       or r.previous_hash is distinct from v_prev
       or r.event_hash is distinct from v_expected then
      v_failures := v_failures + 1;
      v_strict_failures := v_strict_failures + 1;
    end if;
    v_prev := r.event_hash;
  end loop;

  return jsonb_build_object(
    'valid',v_failures=0,
    'events_checked',v_checked,
    'failures',v_failures,
    'legacy_events_checked',v_legacy_checked,
    'legacy_failures',v_legacy_failures,
    'legacy_forks_observed',v_legacy_forks,
    'v2_events_checked',v_v2_checked,
    'v2_failures',v_v2_failures,
    'v2_forks_observed',v_v2_forks,
    'strict_events_checked',v_strict_checked,
    'strict_failures',v_strict_failures,
    'chain_version',3,
    'verified_at',now()
  );
end;
$function$;

revoke all on function governance.verify_audit_chain(uuid) from public;
revoke execute on function governance.verify_audit_chain(uuid) from anon, authenticated;
grant execute on function governance.verify_audit_chain(uuid) to service_role;
