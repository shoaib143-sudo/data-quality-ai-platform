import { createHash } from 'node:crypto'

export type LearningArtifactRole = 'baseline' | 'candidate' | 'replay_input'

export type ImmutableLearningArtifactRef = {
  projectId: string
  candidateId: string
  role: LearningArtifactRole
  version: string
  key: string
  sha256: string
  size: number
  contentType: string
}

/**
 * Storage port for immutable learning artifacts. Implementations must provide
 * atomic create-if-absent behavior and must not expose an overwrite or delete
 * operation through this port.
 */
export interface ImmutableLearningArtifactBackend {
  putIfAbsent(input: {
    key: string
    bytes: Uint8Array
    contentType: string
  }): Promise<boolean>
  get(key: string): Promise<Uint8Array | null>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function validateIdentity(input: {
  projectId: string
  candidateId: string
  role: string
  version: string
}) {
  if (!UUID.test(input.projectId) || !UUID.test(input.candidateId)) throw new Error('LEARNING_ARTIFACT_SCOPE_INVALID')
  if (!['baseline', 'candidate', 'replay_input'].includes(input.role)) throw new Error('LEARNING_ARTIFACT_ROLE_INVALID')
  if (!VERSION.test(input.version)) throw new Error('LEARNING_ARTIFACT_VERSION_INVALID')
}

function artifactKey(input: {
  projectId: string
  candidateId: string
  role: LearningArtifactRole
  version: string
  sha256: string
}): string {
  return `learning/${input.projectId}/${input.candidateId}/${input.role}/${input.version}/${input.sha256}`
}

/**
 * Creates and resolves hash-checked artifacts using an injected create-only
 * backend. This module contains no provider or network integration.
 */
export function createImmutableLearningArtifactStore(backend: ImmutableLearningArtifactBackend) {
  return {
    async create(input: {
      projectId: string
      candidateId: string
      role: LearningArtifactRole
      version: string
      contentType: string
      bytes: Uint8Array
    }): Promise<ImmutableLearningArtifactRef> {
      validateIdentity(input)
      if (!input.contentType.trim() || input.contentType.length > 200) throw new Error('LEARNING_ARTIFACT_CONTENT_TYPE_INVALID')
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) throw new Error('LEARNING_ARTIFACT_BYTES_INVALID')

      const bytes = Uint8Array.from(input.bytes)
      const sha256 = digest(bytes)
      const key = artifactKey({ ...input, sha256 })
      const created = await backend.putIfAbsent({ key, bytes, contentType: input.contentType.trim() })
      if (!created) throw new Error('LEARNING_ARTIFACT_ALREADY_EXISTS')

      const stored = await backend.get(key)
      if (!stored) throw new Error('LEARNING_ARTIFACT_READBACK_MISSING')
      if (digest(stored) !== sha256) throw new Error('LEARNING_ARTIFACT_READBACK_HASH_MISMATCH')

      return {
        projectId: input.projectId,
        candidateId: input.candidateId,
        role: input.role,
        version: input.version,
        key,
        sha256,
        size: bytes.byteLength,
        contentType: input.contentType.trim(),
      }
    },

    async resolve(input: {
      projectId: string
      candidateId: string
      ref: ImmutableLearningArtifactRef
    }): Promise<Uint8Array> {
      validateIdentity(input.ref)
      if (input.projectId !== input.ref.projectId || input.candidateId !== input.ref.candidateId) {
        throw new Error('LEARNING_ARTIFACT_SCOPE_MISMATCH')
      }
      if (!SHA256.test(input.ref.sha256) || input.ref.key !== artifactKey(input.ref)) {
        throw new Error('LEARNING_ARTIFACT_REFERENCE_INVALID')
      }

      const stored = await backend.get(input.ref.key)
      if (!stored) throw new Error('LEARNING_ARTIFACT_NOT_FOUND')
      if (stored.byteLength !== input.ref.size || digest(stored) !== input.ref.sha256) {
        throw new Error('LEARNING_ARTIFACT_INTEGRITY_MISMATCH')
      }
      return Uint8Array.from(stored)
    },
  }
}
