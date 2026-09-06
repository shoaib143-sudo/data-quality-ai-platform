create or replace function catalog.verify_jdbc_source_acceptance(
  p_source_id uuid,
  p_require_multi_namespace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  select *
  into v_source
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
  v_inline_secret_risk := v_config_without_refs::text ~* '"(username|user|password|passwd|pwd|token|access_token|secret|client_secret)"[[:space:]]*:';
  v_url_secret_risk := coalesce(v_jdbc_url, '') ~* '([?;&](user(name)?|password|passwd|pwd|token|access[_-]?token|secret)=|://[^/@:]+:[^/@]+@)';

  select *
  into v_latest_run
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
      select *
      into v_scope_version
      from catalog.source_scope_versions
      where id = v_latest_run.scope_version_id;
      v_scope_frozen := found;
    end if;
  end if;

  select
    count(*),
    coalesce(sum(jsonb_array_length(coalesce(columns, '[]'::jsonb))), 0),
    count(distinct namespace) filter (where namespace is not null and btrim(namespace) <> ''),
    count(identity_key),
    count(distinct identity_key),
    count(*) filter (where identity_key is null or btrim(identity_key) = '')
  into
    v_current_assets,
    v_current_fields,
    v_namespace_count,
    v_current_identity_count,
    v_distinct_identity_count,
    v_null_identity_count
  from catalog.discovered_assets
  where source_id = p_source_id
    and is_current = true;

  select count(*)
  into v_total_physical_versions
  from catalog.discovered_asset_versions
  where source_id = p_source_id;

  select count(*)
  into v_catalog_source_assets
  from catalog.current_catalog_source_assets
  where source_id = p_source_id;

  select *
  into v_latest_revision
  from catalog.catalog_revisions
  where source_id = p_source_id
  order by revision_number desc
  limit 1;

  if found then
    select *
    into v_previous_revision
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
$$;

revoke all on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from public;
revoke execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from anon, authenticated;
grant execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) to service_role;

comment on function catalog.verify_jdbc_source_acceptance(uuid, boolean) is
  'Service-only acceptance verifier for real Generic JDBC onboarding. Returns non-secret discovery, identity, repeatability, projection, scope, and credential-boundary evidence.';
