import { createHash } from 'node:crypto'

export type ReplayManifestCase = {
  caseKey: string
  split: 'TRAINING' | 'HELD_OUT'
  sourceCaseRef: string
  /** Must come from canonical persisted manifest evidence. */
  payloadHash: string
}

export type ReplayManifestSnapshot = {
  projectId: string
  manifestId: string
  datasetVersionId: string
  manifestHash: string
  evidenceCutoffAt: string
  cases: readonly ReplayManifestCase[]
}

export type SealedReplayBytes = {
  projectId: string
  manifestId: string
  datasetVersionId: string
  caseKey: string
  sourceCaseRef: string
  bytes: string
}

export type HeldOutReplayReader = {
  /** Resolve only from an immutable, project-scoped source. */
  read(sourceCaseRef: string): Promise<SealedReplayBytes | null>
}

export type ResolvedHeldOutCase = {
  caseKey: string
  datasetVersionId: string
  split: 'held_out'
  input: { ref: string; hash: string; bytes: string }
}

const SHA256 = /^sha256:[a-f0-9]{64}$/
const CASE_KEY = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATASET_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

function hashBytes(bytes: string): string {
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`
}

/** Must remain byte-for-byte aligned with agent.learning_benchmark_manifest_digest. */
export function computeReplayManifestHash(manifest: Omit<ReplayManifestSnapshot, 'manifestHash'>): string {
  const fields = [manifest.projectId, manifest.datasetVersionId, String(manifest.cases.length)]
  for (const item of [...manifest.cases].sort((left, right) => left.caseKey < right.caseKey ? -1 : left.caseKey > right.caseKey ? 1 : 0)) {
    fields.push(item.caseKey, item.split, item.sourceCaseRef, item.payloadHash)
  }
  const encoder = new TextEncoder()
  const canonical = fields.map(field => `${encoder.encode(field).byteLength}:${field}`).join('')
  return hashBytes(canonical)
}

/**
 * Resolve exact, pinned held-out bytes before a runner may dispatch.
 * This pure adapter fails closed. Live use still requires a trusted server-side
 * loader and a reviewed runner composition that invokes it before dispatch.
 */
export async function resolveHeldOutReplayBytes(input: {
  manifest: ReplayManifestSnapshot
  expected: { projectId: string; manifestId: string; datasetVersionId: string; evidenceCutoffAt: string; manifestHash: string }
  expectedCaseKeys: readonly string[]
  trainingCaseKeys: readonly string[]
  reader: HeldOutReplayReader
}): Promise<ResolvedHeldOutCase[]> {
  const { manifest, expected } = input
  if (!UUID.test(expected.projectId) || !UUID.test(expected.manifestId) || !DATASET_VERSION.test(expected.datasetVersionId)
    || !SHA256.test(expected.manifestHash)) throw new Error('REPLAY_EXPECTED_SCOPE_INVALID')
  if (manifest.projectId !== expected.projectId || manifest.manifestId !== expected.manifestId
    || manifest.datasetVersionId !== expected.datasetVersionId || manifest.evidenceCutoffAt !== expected.evidenceCutoffAt) throw new Error('REPLAY_MANIFEST_SCOPE_MISMATCH')
  if (manifest.manifestHash !== expected.manifestHash || !SHA256.test(manifest.manifestHash)) throw new Error('REPLAY_MANIFEST_STALE')
  if (manifest.cases.some((item) => !SHA256.test(item.payloadHash))) throw new Error('REPLAY_PAYLOAD_HASH_MISSING')
  if (computeReplayManifestHash(manifest) !== manifest.manifestHash) throw new Error('REPLAY_MANIFEST_CONTENT_HASH_MISMATCH')
  if (!Number.isFinite(Date.parse(manifest.evidenceCutoffAt)) || manifest.cases.length === 0) throw new Error('REPLAY_MANIFEST_INVALID')

  const training = new Set(input.trainingCaseKeys)
  const expectedKeys = [...input.expectedCaseKeys]
  if (expectedKeys.length === 0 || expectedKeys.some((key) => !CASE_KEY.test(key))
    || new Set(expectedKeys).size !== expectedKeys.length || expectedKeys.some((key) => training.has(key))) {
    throw new Error('REPLAY_CASE_SET_INVALID')
  }

  const cases = new Map<string, ReplayManifestCase>()
  for (const item of manifest.cases) {
    if (!CASE_KEY.test(item.caseKey) || cases.has(item.caseKey) || !item.sourceCaseRef.trim()
      || !['TRAINING', 'HELD_OUT'].includes(item.split)) throw new Error('REPLAY_MANIFEST_CASE_INVALID')
    cases.set(item.caseKey, item)
  }
  for (const key of expectedKeys) {
    const item = cases.get(key)
    if (!item || item.split !== 'HELD_OUT' || training.has(key)) throw new Error('REPLAY_CASE_NOT_HELD_OUT')
    if (!SHA256.test(item.payloadHash)) throw new Error('REPLAY_PAYLOAD_HASH_MISSING')
  }

  const resolved: ResolvedHeldOutCase[] = []
  const sourceRefs = new Set<string>()
  for (const key of expectedKeys) {
    const item = cases.get(key)!
    if (sourceRefs.has(item.sourceCaseRef)) throw new Error('REPLAY_SOURCE_REFERENCE_REUSED')
    sourceRefs.add(item.sourceCaseRef)
    const source = await input.reader.read(item.sourceCaseRef)
    if (!source) throw new Error('REPLAY_SOURCE_MISSING')
    if (source.projectId !== expected.projectId || source.manifestId !== expected.manifestId
      || source.datasetVersionId !== expected.datasetVersionId || source.caseKey !== item.caseKey
      || source.sourceCaseRef !== item.sourceCaseRef) throw new Error('REPLAY_SOURCE_SCOPE_MISMATCH')
    const actualHash = hashBytes(source.bytes)
    if (actualHash !== item.payloadHash) throw new Error('REPLAY_PAYLOAD_HASH_MISMATCH')
    resolved.push({
      caseKey: item.caseKey,
      datasetVersionId: manifest.datasetVersionId,
      split: 'held_out',
      input: { ref: item.sourceCaseRef, hash: actualHash, bytes: source.bytes },
    })
  }
  return resolved
}
