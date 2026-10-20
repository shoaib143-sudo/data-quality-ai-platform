import assert from 'node:assert/strict'
import { createImmutableLearningArtifactStore } from '../lib/agents/immutable-learning-artifact-store.ts'

const projectId = '10000000-0000-4000-8000-000000000001'
const candidateId = '20000000-0000-4000-8000-000000000001'

function fixture() {
  const objects = new Map()
  const backend = {
    async putIfAbsent({ key, bytes }) {
      if (objects.has(key)) return false
      objects.set(key, Uint8Array.from(bytes))
      return true
    },
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? Uint8Array.from(bytes) : null
    },
  }
  return { store: createImmutableLearningArtifactStore(backend), objects }
}

const { store, objects } = fixture()
const source = new TextEncoder().encode('reviewed candidate prompt bytes')
const ref = await store.create({
  projectId, candidateId, role: 'candidate', version: 'v1', contentType: 'text/plain', bytes: source,
})
source.fill(0)
assert.deepEqual(new TextDecoder().decode(await store.resolve({ projectId, candidateId, ref })), 'reviewed candidate prompt bytes')
assert.match(ref.sha256, /^[0-9a-f]{64}$/)

await assert.rejects(() => store.create({
  projectId, candidateId, role: 'candidate', version: 'v1', contentType: 'text/plain',
  bytes: new TextEncoder().encode('reviewed candidate prompt bytes'),
}), /LEARNING_ARTIFACT_ALREADY_EXISTS/)

await assert.rejects(() => store.resolve({
  projectId: '10000000-0000-4000-8000-000000000002', candidateId, ref,
}), /LEARNING_ARTIFACT_SCOPE_MISMATCH/)

const stored = objects.get(ref.key)
stored[0] ^= 0xff
await assert.rejects(() => store.resolve({ projectId, candidateId, ref }), /LEARNING_ARTIFACT_INTEGRITY_MISMATCH/)

const { store: missingStore } = fixture()
await assert.rejects(() => missingStore.resolve({ projectId, candidateId, ref }), /LEARNING_ARTIFACT_NOT_FOUND/)

const brokenReadback = createImmutableLearningArtifactStore({
  async putIfAbsent() { return true },
  async get() { return null },
})
await assert.rejects(() => brokenReadback.create({
  projectId, candidateId, role: 'baseline', version: 'v1', contentType: 'text/plain',
  bytes: new TextEncoder().encode('baseline'),
}), /LEARNING_ARTIFACT_READBACK_MISSING/)
console.log('Immutable learning artifact adapter rejects duplicates, missing objects, scope mismatch, tampering, and failed readback using a synthetic in-memory backend.')
