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
]) {
  assert.ok(source.includes(invariant), `missing regulatory retrieval provenance invariant: ${invariant}`)
}

assert.ok(
  source.indexOf('source_document_url') > source.indexOf('KNOWLEDGE_REQUIREMENT'),
  'source-document provenance must be attached to requirement-level retrieval candidates',
)

assert.equal(
  source.includes('document_review_status: document?.review_status'),
  false,
  'legacy ambiguous requirement provenance key must not remain after source-scoped normalization',
)

console.log('Requirement-level policy/regulatory retrieval preserves source document provenance for filtering and citation context.')
