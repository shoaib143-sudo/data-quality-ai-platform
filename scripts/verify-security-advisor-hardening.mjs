import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906084000_harden_supabase_security_advisor.sql'
const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase()

function requireText(needle, label) {
  if (!migration.includes(needle.toLowerCase())) {
    throw new Error(`Security advisor hardening contract missing: ${label}`)
  }
}

for (const view of [
  'catalog.current_discovered_assets',
  'governance.classification_catalog_coverage',
  'governance.classification_dataset_coverage',
  'governance.privacy_control_hooks',
]) {
  requireText(`alter view ${view} set (security_invoker = true)`, `${view} must be SECURITY INVOKER`)
  requireText(`revoke insert, update, delete on ${view} from anon, authenticated`, `${view} browser DML revoked`)
}

for (const signature of [
  'catalog.prepare_discovered_asset_version()',
  'catalog.reconcile_discovered_assets(uuid, uuid, jsonb)',
]) {
  requireText(`alter function ${signature} set search_path = ''`, `${signature} fixed search_path`)
  requireText(`revoke all on function ${signature} from public`, `${signature} PUBLIC execute revoked`)
  requireText(`revoke execute on function ${signature} from anon, authenticated`, `${signature} browser execute revoked`)
  requireText(`grant execute on function ${signature} to service_role`, `${signature} service-role execution preserved`)
}

for (const policy of [
  'discovery_checkpoints_service_only',
  'discovery_staging_assets_service_only',
  'autonomy_actions_service_only',
  'autonomy_policies_service_only',
  'business_context_assets_service_only',
  'dataset_business_context_links_service_only',
  'governance_risk_predictions_service_only',
  'analytics_events_service_only',
  'object_artifacts_service_only',
  'projection_outbox_service_only',
]) {
  requireText(`create policy ${policy}`, `${policy} explicit service-only RLS boundary`)
}

const denyPolicyCount = (migration.match(/for all to anon, authenticated\s+using \(false\)\s+with check \(false\)/g) ?? []).length
if (denyPolicyCount !== 10) {
  throw new Error(`Expected 10 explicit browser-deny RLS policies, found ${denyPolicyCount}`)
}

console.log('Supabase security advisor hardening contract verified.')
