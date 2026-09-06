import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906105500_govern_source_operational_readiness.sql'
const pagePath = 'app/catalog/discovery/page.tsx'
const migration = fs.readFileSync(migrationPath, 'utf8')
const page = fs.readFileSync(pagePath, 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Source operational readiness contract missing: ${label}`)
}

function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Source operational readiness contract missing: ${label}`)
}

requireText(migration, 'catalog.source_operational_readiness', 'derived readiness projection')
requireText(migration, 'security_invoker = true', 'RLS-preserving view semantics')
requireText(migration, 'catalog.verify_source_operational_readiness()', 'readiness verifier')
requireText(migration, 'DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE', 'authority boundary')
requireText(migration, "'UNOBSERVED'", 'unobserved state')
requireText(migration, "'DISCOVERY_IN_PROGRESS'", 'in-progress state')
requireText(migration, "'LAST_DISCOVERY_FAILED'", 'failed-discovery state')
requireText(migration, "'OBSERVED_EMPTY'", 'observed-empty state')
requireText(migration, "'OBSERVED_READY'", 'observed-ready state')
requireText(migration, "'EVIDENCE_INCONSISTENT'", 'evidence inconsistency state')
requireText(migration, 'catalog.discovery_runs', 'discovery-run evidence')
requireText(migration, 'catalog.discovered_assets', 'current physical metadata evidence')
requireText(migration, 'catalog.data_sources', 'source lifecycle evidence')
requireText(migration, 'grant select on table catalog.source_operational_readiness to authenticated, service_role', 'read-only projection access')
requirePattern(migration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*authenticated, service_role/, 'projection mutation privileges revoked')
requirePattern(migration, /ds\.status as lifecycle_status[\s\S]*case[\s\S]*operational_state/, 'lifecycle and operational states remain separate')
requirePattern(migration, /latest_run_status = 'COMPLETED' and e\.current_assets > 0 then 'OBSERVED_READY'/, 'ready requires completed observation with current assets')
requirePattern(migration, /latest_run_id is null and e\.current_assets = 0 then 'UNOBSERVED'/, 'unobserved state requires absence of run and assets')

requireText(page, ".from('source_operational_readiness')", 'discovery UI reads governed readiness projection')
requireText(page, 'Operational evidence', 'discovery UI labels evidence separately from lifecycle')
requireText(page, 'Lifecycle', 'discovery UI preserves lifecycle status label')

console.log('Source operational readiness contract verified.')
