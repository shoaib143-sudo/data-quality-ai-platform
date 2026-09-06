import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906085000_verify_non_lineage_enterprise_acceptance.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const lower = migration.toLowerCase()

function requireText(needle, label) {
  if (!lower.includes(needle.toLowerCase())) {
    throw new Error(`Non-lineage enterprise acceptance contract missing: ${label}`)
  }
}

function requirePattern(pattern, label) {
  if (!pattern.test(migration)) {
    throw new Error(`Non-lineage enterprise acceptance contract missing: ${label}`)
  }
}

requireText('governance.verify_non_lineage_enterprise_acceptance', 'production acceptance verifier')
requireText('security invoker', 'caller-authority execution boundary')
requireText("set search_path = ''", 'fixed function search path')
requireText('revoke all on function governance.verify_non_lineage_enterprise_acceptance(uuid) from public', 'PUBLIC execute revoked')
requireText('revoke execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) from anon, authenticated', 'browser execute revoked')
requireText('grant execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) to service_role', 'service-role execute preserved')

for (const verifier of [
  'verify_glossary_evidence_posture',
  'verify_stewardship_governance_posture',
  'verify_classification_privacy_posture',
  'verify_quality_control_posture',
  'verify_workflow_contract_posture',
  'verify_audit_reporting_posture',
  'verify_ai_assisted_governance_posture',
  'verify_governance_intelligence_posture',
  'verify_autonomous_agent_posture',
  'verify_ai_system_governance_posture',
  'verify_semantic_search_posture',
  'verify_database_api_security_posture',
  'verify_audit_chain',
  'verify_ai_governance_intelligence_active',
  'verify_jdbc_source_acceptance',
]) {
  requireText(verifier, `reuses governed verifier ${verifier}`)
}

for (const catalogEvidence of [
  'catalog.discovery_runs',
  "schema_snapshot->'discovery_manifest'",
  'catalog.discovered_assets',
  'identity_key',
  'catalog.discovered_asset_versions',
  'catalog.current_catalog_source_assets',
]) {
  requireText(catalogEvidence, `catalog evidence ${catalogEvidence}`)
}

requireText('NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED', 'explicit success state')
requireText("'included_modules', jsonb_build_array(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)", 'only non-lineage modules included')
requireText("'excluded_modules', jsonb_build_array(3)", 'Module #3 explicitly excluded')
requireText("'state', 'BLOCKED_EXTERNAL'", 'Module #3 external blocker state')
requireText('DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED', 'Databricks lineage blocker retained')
requireText('USE SCHEMA on system.access', 'exact Databricks privilege blocker retained')
requireText('REAL_FIELD_LINEAGE_DATA_NOT_INGESTED', 'real field-lineage data blocker retained')
requireText("'inference_allowed', false", 'lineage inference prohibited')
requireText("jsonb_array_length(coalesce(v_active_intelligence->'blockers', '[]'::jsonb)) = 1", 'exactly one expected partial blocker')
requireText("v_active_intelligence->'blockers'->0->>'code' = 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED'", 'partial state cannot hide another blocker')

requireText("external_references_confer_internal_authority')::boolean, true", 'external references do not imply internal authority')
requireText("contracts_certification'->>'status' = 'PASS'", 'contract certification required')
requireText('v_accepted_jdbc_sources = v_observed_jdbc_sources', 'all observed JDBC sources must pass acceptance')
requireText('v_multi_namespace_evidence', 'multi-schema JDBC evidence required')
requirePattern(/count\(distinct \(a\.source_id, a\.identity_key\)\)/, 'stable identities are unique per source')
requirePattern(/v_projected_assets\s*=\s*v_current_assets/, 'catalog projection must match current physical assets')
requirePattern(/v_complete_manifest_sources\s*=\s*v_observed_sources/, 'all observed sources require complete discovery manifests')

if (/security\s+definer/i.test(migration)) {
  throw new Error('Non-lineage enterprise verifier must not introduce SECURITY DEFINER authority.')
}

console.log('Non-lineage enterprise acceptance contract verified.')
