import fs from 'node:fs'

const baseMigrationPath = 'supabase/migrations/20260906085000_verify_non_lineage_enterprise_acceptance.sql'
const integrationMigrationPath = 'supabase/migrations/20260907133000_integrate_project_source_readiness_enterprise_acceptance.sql'
const baseMigration = fs.readFileSync(baseMigrationPath, 'utf8')
const integrationMigration = fs.readFileSync(integrationMigrationPath, 'utf8')
const migration = `${baseMigration}\n${integrationMigration}`
const lower = migration.toLowerCase()
const integrationLower = integrationMigration.toLowerCase()

function requireText(needle, label) {
  if (!lower.includes(needle.toLowerCase())) {
    throw new Error(`Non-lineage enterprise acceptance contract missing: ${label}`)
  }
}

function requireIntegrationText(needle, label) {
  if (!integrationLower.includes(needle.toLowerCase())) {
    throw new Error(`Enterprise source-readiness integration missing: ${label}`)
  }
}

function requirePattern(pattern, label) {
  if (!pattern.test(migration)) {
    throw new Error(`Non-lineage enterprise acceptance contract missing: ${label}`)
  }
}

function requireIntegrationPattern(pattern, label) {
  if (!pattern.test(integrationMigration)) {
    throw new Error(`Enterprise source-readiness integration missing: ${label}`)
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
  'verify_project_source_operational_readiness',
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

requireIntegrationText('rename to verify_non_lineage_enterprise_acceptance_base', 'existing enterprise acceptance preserved as internal base')
requireIntegrationText('catalog.verify_project_source_operational_readiness(p_project_id)', 'project-scoped readiness verifier consumed')
requireIntegrationText("'{catalog,source_operational_readiness}'", 'readiness evidence embedded in catalog payload')
requireIntegrationPattern(/coalesce\(\(v_base->>'valid'\)::boolean, false\)\s*\n\s*and coalesce\(\(v_source_readiness->>'valid'\)::boolean, false\)/, 'overall acceptance requires base and source-readiness validity')
requireIntegrationText('without requiring all configured sources to be observed', 'UNOBSERVED configured sources remain allowed')
requireIntegrationText('revoke execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) from anon, authenticated', 'internal base remains browser-inaccessible')
requireIntegrationText('grant execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) to service_role', 'internal base remains service-only')

if (/security\s+definer/i.test(migration)) {
  throw new Error('Non-lineage enterprise verifier must not introduce SECURITY DEFINER authority.')
}

console.log('Non-lineage enterprise acceptance contract verified.')
