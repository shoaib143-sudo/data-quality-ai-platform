import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/governance/semantic-knowledge-indexer.ts', 'utf8')

for (const invariant of [
  'Source document type:',
  'Source domain:',
  'Source jurisdiction:',
  'source_document_id',
  'source_document_key',
  'source_document_title',
  'source_document_type',
  'source_document_domain',
  'source_document_jurisdiction',
  'source_document_kind',
  'source_document_url',
  'source_document_review_status',
  'source_document_expires_at',
  'source_document_effective_at',
]) {
  assert.ok(source.includes(invariant), `missing regulatory retrieval provenance invariant: ${invariant}`)
}

assert.ok(
  source.indexOf('source_document_url') > source.indexOf('KNOWLEDGE_REQUIREMENT'),
  'source-document provenance must be attached to requirement-level retrieval candidates',
)

assert.ok(
  source.includes('source_document_review_status: document?.review_status ?? null'),
  'requirement provenance must use an explicit source-scoped review-status key',
)

assert.ok(
  source.indexOf('...(requirement.metadata ?? {})') < source.indexOf('source_document_id: requirement.document_id'),
  'canonical requirement source provenance must override caller-supplied metadata keys',
)
assert.ok(
  source.indexOf('...(document.metadata ?? {})') < source.indexOf('document_type: document.document_type'),
  'canonical document provenance must override document metadata keys',
)

const lexicalMigration = fs.readFileSync(
  'supabase/migrations/20260920043500_governance_knowledge_exact_regulatory_search.sql',
  'utf8',
)
for (const invariant of [
  "lower(d.document_key) = lower(q.query)",
  "d.document_key ilike '%' || q.query || '%'",
  "lower(r.requirement_key) = lower(q.query)",
  "r.requirement_key ilike '%' || q.query || '%'",
  "join governance.knowledge_documents d",
  "d.status = 'ACTIVE'",
  "d.review_status = 'APPROVED'",
  "d.effective_at is null or d.effective_at <= now()",
  "d.expires_at is null or d.expires_at > now()",
  "'source_document_url', d.source_url",
  "'source_document_review_status', d.review_status",
  "coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object",
]) {
  assert.ok(lexicalMigration.includes(invariant), `missing exact regulatory retrieval invariant: ${invariant}`)
}


console.log('Requirement-level policy/regulatory retrieval preserves source document provenance for filtering and citation context.')
