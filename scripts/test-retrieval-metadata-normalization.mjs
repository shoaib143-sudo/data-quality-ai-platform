import assert from 'node:assert/strict'

const { normalizeRetrievalMetadata, withNormalizedRetrievalMetadata } = await import('../lib/ai/retrieval-metadata-normalization.ts')

const now = new Date('2026-09-11T00:00:00.000Z')

assert.deepEqual(normalizeRetrievalMetadata({
  authority: 'approved',
  observed_at: '2026-09-10T23:00:00Z',
}, now), {
  version: '1',
  authorityClass: 'GOVERNED_DECISION',
  authoritySource: 'authority',
  temporalStatus: 'VALID',
  temporalValue: '2026-09-10T23:00:00.000Z',
  temporalSource: 'observed_at',
})

assert.equal(normalizeRetrievalMetadata({ authority_status: 'source-observed' }, now).authorityClass, 'OBSERVED_EVIDENCE')
assert.equal(normalizeRetrievalMetadata({ authority_class: 'derived intelligence' }, now).authorityClass, 'DERIVED_INTELLIGENCE')
assert.equal(normalizeRetrievalMetadata({ authority: 'model_guess' }, now).authorityClass, 'UNKNOWN')
assert.equal(normalizeRetrievalMetadata({}, now).authorityClass, 'UNKNOWN')
assert.equal(normalizeRetrievalMetadata({}, now).temporalStatus, 'MISSING')
assert.equal(normalizeRetrievalMetadata({ updated_at: 'not-a-date' }, now).temporalStatus, 'INVALID')
assert.equal(normalizeRetrievalMetadata({ updated_at: '2026-09-12T00:00:00Z' }, now).temporalStatus, 'FUTURE')

const source = { authority: 'canonical', created_at: '2026-09-01T00:00:00Z', nested: { keep: true } }
const projected = withNormalizedRetrievalMetadata(source, now)
assert.deepEqual(projected.nested, { keep: true })
assert.equal(projected.authority, 'canonical')
assert.equal(projected.retrieval_normalization.authorityClass, 'AUTHORITATIVE_FACT')
assert.equal(projected.retrieval_normalization.temporalSource, 'created_at')
assert.deepEqual(source, { authority: 'canonical', created_at: '2026-09-01T00:00:00Z', nested: { keep: true } }, 'source metadata must not be mutated')

console.log('Retrieval authority/temporal metadata normalization verified without ranking or authority fabrication.')
