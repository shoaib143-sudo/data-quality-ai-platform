import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906072000_verify_generic_jdbc_acceptance.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Generic JDBC acceptance contract missing: ${label}`)
}

function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Generic JDBC acceptance contract missing: ${label}`)
}

requireText(migration, 'catalog.verify_jdbc_source_acceptance', 'production acceptance verifier')
requireText(migration, 'security definer', 'trusted server-side execution boundary')
requireText(migration, "set search_path = ''", 'fixed security-definer search path')
requireText(migration, "revoke all on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from public", 'PUBLIC execute revoked')
requireText(migration, "revoke execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) from anon, authenticated", 'browser roles cannot execute verifier')
requireText(migration, "grant execute on function catalog.verify_jdbc_source_acceptance(uuid, boolean) to service_role", 'service-role verifier access')

requireText(migration, 'catalog.discovery_runs', 'real discovery-run evidence')
requireText(migration, "schema_snapshot->'discovery_manifest'", 'complete discovery manifest evidence')
requireText(migration, 'catalog.discovered_assets', 'current physical asset evidence')
requireText(migration, 'identity_key', 'stable identity completeness evidence')
requireText(migration, 'catalog.discovered_asset_versions', 'physical version evidence')
requireText(migration, 'catalog.current_catalog_source_assets', 'published catalog projection evidence')
requireText(migration, 'catalog.catalog_revisions', 'repeat-discovery revision evidence')
requireText(migration, 'catalog.source_scope_versions', 'frozen discovery scope evidence')
requireText(migration, 'p_require_multi_namespace', 'multi-schema acceptance requirement')
requireText(migration, 'repeat_scan_stable', 'idempotent repeat-scan acceptance')

requirePattern(migration, /v_config\s*-\s*array\['credential_ref','credentialRef','secret_ref','secretRef'\]/, 'credential references excluded from inline-secret detection')
requirePattern(migration, /no_inline_secret_material[\s\S]*no_secret_material_in_jdbc_url/, 'credential-boundary checks are exposed without secret values')
requirePattern(migration, /v_distinct_identity_count\s*=\s*v_current_assets/, 'duplicate current identities fail acceptance')
requirePattern(migration, /v_catalog_source_assets\s*=\s*v_current_assets/, 'catalog projection must match discovered current assets')
requirePattern(migration, /v_repeat_scan_evidence_present[\s\S]*v_repeat_scan_stable/, 'repeatability is mandatory')
requirePattern(migration, /'security',\s*jsonb_build_object\([\s\S]*'credential_reference_configured'[\s\S]*'inline_secret_material_detected'[\s\S]*'jdbc_url_secret_material_detected'/, 'security evidence exposes booleans only')

console.log('Generic JDBC production acceptance contract verified.')
