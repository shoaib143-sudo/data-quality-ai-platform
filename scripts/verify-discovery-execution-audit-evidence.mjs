import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907123000_audit_discovery_execution_evidence.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

for (const eventType of [
  'METADATA_DISCOVERY_EXECUTION_STARTED',
  'METADATA_DISCOVERY_EXECUTION_SUCCEEDED',
  'METADATA_DISCOVERY_EXECUTION_INCOMPLETE',
  'METADATA_DISCOVERY_EXECUTION_FAILED',
]) {
  if (!sql.includes(eventType)) throw new Error(`Missing discovery execution audit event ${eventType}`)
}

if (!sql.includes("'SYSTEM'")) throw new Error('Discovery execution evidence must identify the worker as SYSTEM')
if (!sql.includes("'DISCOVERY_EXECUTION_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE'")) {
  throw new Error('Missing discovery execution authority boundary')
}
if (!sql.includes('correlation_id') || !sql.includes('new.id')) {
  throw new Error('Discovery execution audit evidence must correlate to the discovery run identity')
}
if (!sql.includes('new.durable_job_id') || !sql.includes('new.catalog_revision_id')) {
  throw new Error('Discovery execution audit evidence must retain durable job and publication identities')
}
if (/connection_metadata|credential_ref|jdbc_url|password|secret_ref/i.test(sql)) {
  throw new Error('Discovery execution audit evidence must not copy connection or credential material')
}
if (/update\s+catalog\.data_sources|insert\s+into\s+catalog\.data_sources|delete\s+from\s+catalog\.data_sources/i.test(sql)) {
  throw new Error('Discovery execution audit evidence must not mutate source lifecycle state')
}

console.log('Discovery execution audit evidence contract verified with SYSTEM execution authority and no source lifecycle mutation.')
