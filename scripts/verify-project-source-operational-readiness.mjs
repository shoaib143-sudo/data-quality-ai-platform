import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907124500_project_source_operational_readiness.sql'
const globalMigrationPath = 'supabase/migrations/20260906105500_govern_source_operational_readiness.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const globalMigration = fs.readFileSync(globalMigrationPath, 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Project source operational readiness contract missing: ${label}`)
}

function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Project source operational readiness contract missing: ${label}`)
}

requireText(globalMigration, 'catalog.verify_source_operational_readiness()', 'global verifier remains present')
requireText(migration, 'catalog.verify_project_source_operational_readiness(p_project_id uuid)', 'project-scoped verifier')
requireText(migration, 'where project_id = p_project_id', 'project isolation filter')
requireText(migration, "'project_id', p_project_id", 'project identity in verifier evidence')
requireText(migration, "'PROJECT_SOURCE_OPERATIONAL_READINESS_GOVERNED'", 'project-scoped governed state')
requireText(migration, 'DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE', 'authority boundary')
requireText(migration, 'catalog.source_operational_readiness', 'governed readiness projection consumption')
requireText(migration, 'grant execute on function catalog.verify_project_source_operational_readiness(uuid) to authenticated, service_role', 'governed verifier access')
requirePattern(migration, /revoke all on function catalog\.verify_project_source_operational_readiness\(uuid\) from public, anon/, 'anonymous execution revoked')
requirePattern(migration, /unknown_state_count = 0[\s\S]*ready_without_assets = 0[\s\S]*unobserved_with_evidence = 0[\s\S]*evidence_inconsistent = 0/, 'same readiness violations enforced')

if (/create or replace function catalog\.verify_source_operational_readiness\(\)/i.test(migration)) {
  throw new Error('Project-scoped migration must not replace the existing global readiness verifier')
}
if (/update\s+catalog\.data_sources|insert\s+into\s+catalog\.data_sources|delete\s+from\s+catalog\.data_sources/i.test(migration)) {
  throw new Error('Project-scoped readiness verifier must not mutate source lifecycle state')
}

console.log('Project-scoped source operational readiness contract verified without changing global readiness or source lifecycle authority.')
