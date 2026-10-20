import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { computeReplayManifestHash, resolveHeldOutReplayBytes } from '../lib/agents/held-out-replay-byte-resolver.ts'

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const projectId = '10000000-0000-4000-8000-000000000001'
const manifestId = '20000000-0000-4000-8000-000000000001'
const datasetVersionId = '30000000-0000-4000-8000-000000000001'
const trainKey = createHash('sha256').update('training-case').digest('hex')
const heldKey = createHash('sha256').update('heldout-case').digest('hex')
const bytes = '{"input":"sealed held-out bytes"}'
const manifestContent = {
  projectId, manifestId, datasetVersionId,
  evidenceCutoffAt: '2026-10-19T00:00:00.000Z',
  cases: [
    { caseKey: trainKey, split: 'TRAINING', sourceCaseRef: 'sealed://train/1', payloadHash: digest('training') },
    { caseKey: heldKey, split: 'HELD_OUT', sourceCaseRef: 'sealed://held/1', payloadHash: digest(bytes) },
  ],
}
const manifestHash = computeReplayManifestHash(manifestContent)
const manifest = { ...manifestContent, manifestHash }
const source = { projectId, manifestId, datasetVersionId, caseKey: heldKey, sourceCaseRef: 'sealed://held/1', bytes }
const expected = { projectId, manifestId, datasetVersionId, manifestHash }
const resolve = (overrides = {}) => resolveHeldOutReplayBytes({
  manifest, expected, expectedCaseKeys: [heldKey], trainingCaseKeys: [trainKey],
  reader: { read: async () => source }, ...overrides,
})

const result = await resolve()
assert.equal(result.length, 1)
assert.equal(result[0].input.bytes, bytes)
assert.equal(result[0].input.hash, digest(bytes))
assert.equal(result[0].split, 'held_out')

await assert.rejects(() => resolve({ reader: { read: async () => null } }), /REPLAY_SOURCE_MISSING/)
await assert.rejects(() => resolve({ reader: { read: async () => ({ ...source, bytes: 'tampered' }) } }), /REPLAY_PAYLOAD_HASH_MISMATCH/)
await assert.rejects(() => resolve({ expected: { ...expected, manifestHash: digest('old-manifest') } }), /REPLAY_MANIFEST_STALE/)
await assert.rejects(() => resolve({ manifest: { ...manifest, cases: [{ ...manifest.cases[0] }, { ...manifest.cases[1], payloadHash: digest('tampered manifest hash field') }] } }), /REPLAY_MANIFEST_CONTENT_HASH_MISMATCH/)
await assert.rejects(() => resolve({ expected: { ...expected, projectId: '40000000-0000-4000-8000-000000000001' } }), /REPLAY_MANIFEST_SCOPE_MISMATCH/)
await assert.rejects(() => resolve({ expectedCaseKeys: [trainKey] }), /REPLAY_CASE_SET_INVALID/)
await assert.rejects(() => resolve({ trainingCaseKeys: [heldKey] }), /REPLAY_CASE_SET_INVALID/)
await assert.rejects(() => resolve({ reader: { read: async () => ({ ...source, projectId: '40000000-0000-4000-8000-000000000001' }) } }), /REPLAY_SOURCE_SCOPE_MISMATCH/)
await assert.rejects(() => resolve({ manifest: { ...manifest, cases: [{ ...manifest.cases[1], payloadHash: undefined }] } }), /REPLAY_PAYLOAD_HASH_MISSING/)

console.log('Held-out replay byte resolver pins manifest scope, split, source identity, and exact payload hash; missing, stale, leaked, tampered, and cross-scope cases fail closed.')
