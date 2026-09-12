import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912063000_project_profile_readiness.sql','utf8')

const required = [
  'catalog.verify_project_profile_readiness(p_project_id uuid)',
  'DERIVED_READINESS_DOES_NOT_MUTATE_SOURCE_OR_PROFILING_LIFECYCLE',
  "s.status = 'ACTIVE'",
  's.current_version_id is not null',
  'join catalog.source_scope_versions sv on sv.id = s.current_version_id',
  'and sv.scope_id = s.id',
  'and sv.source_id = s.source_id',
  'and sv.project_id = s.project_id',
  "sor.operational_state = 'OBSERVED_READY'",
  'profiling.dataset_execution_sources',
  'aes.active = true',
  "when ds.source_type = 'JDBC'",
  'coalesce(lm.complete,false)',
  'not coalesce(lm.truncated,true)',
  'DISCOVERY_EVIDENCE_INCOMPLETE',
  'EXECUTION_SOURCE_NOT_BOUND',
  'GOVERNED_SCOPE_NOT_READY',
  'SOURCE_NOT_OBSERVED_READY',
  'grant execute on function catalog.verify_project_profile_readiness(uuid) to authenticated, service_role'
]
for (const marker of required) {
  if (!migration.includes(marker)) throw new Error('Profile readiness contract missing: '+marker)
}
if (migration.includes('sv.frozen_at')) {
  throw new Error('Profile readiness must bind to the active scope-version identity rather than unused frozen_at state')
}
if (/update\s+catalog\.data_sources|update\s+catalog\.datasets|insert\s+into\s+profiling\.profile_runs|delete\s+from/i.test(migration)) {
  throw new Error('Profile readiness verifier must remain derived/read-only')
}
if (/grant\s+execute[^;]+\b(public|anon)\b/i.test(migration)) {
  throw new Error('Anonymous profile-readiness execution must remain revoked')
}
console.log('Project profile readiness contract verified as derived, fail-closed, and bound to authoritative active scope-version identity.')
