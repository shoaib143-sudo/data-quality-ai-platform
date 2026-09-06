import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906070000_govern_reference_corpus_truth.sql', 'utf8')
const readiness = fs.readFileSync('app/api/health/ready/route.ts', 'utf8')
const embeddingFunction = fs.readFileSync('supabase/functions/governance-embed/index.ts', 'utf8')

const requiredMigrationContracts = [
  'governance.governance_corpus_truth',
  "source_kind = 'EXTERNAL_REFERENCE'",
  "'external_references_confer_internal_authority', false",
  "'HUMAN_APPROVAL_REQUIRED_FOR_ENTERPRISE_AUTHORITY'",
  "item->>'code' <> 'REAL_GOVERNANCE_CORPUS_NOT_INGESTED'",
  "regexp_replace(document_key, '^external-nist-', 'ext-nist-')",
  "'real_field_lineage_data_not_ingested',true",
  "'real_governance_corpus_not_ingested',not coalesce",
  "'synthetic_governance_authority_claimed',false",
]

for (const contract of requiredMigrationContracts) {
  if (!migration.includes(contract)) throw new Error(`Missing governance reference truth contract: ${contract}`)
}

if (migration.includes("review_status = 'APPROVED'\n          and reviewed_by is null")) {
  throw new Error('Governance reference migration may not fabricate human approval.')
}

for (const contract of [
  "admin.functions.invoke('governance-embed', { body: { action: 'health' } })",
  "payload.status === 'healthy'",
  "payload.model === 'gte-small'",
  'Number(payload.dimensions) === 384',
]) {
  if (!readiness.includes(contract)) throw new Error(`Missing governed embedding readiness contract: ${contract}`)
}

for (const contract of [
  "body.action === 'health'",
  "status: 'healthy'",
  "model: 'gte-small'",
  'dimensions: DIMENSIONS',
  "bearerRole(req) !== 'service_role'",
]) {
  if (!embeddingFunction.includes(contract)) throw new Error(`Missing embedding function health/security contract: ${contract}`)
}

console.log('Governance reference corpus and governed embedding readiness contracts passed.')
