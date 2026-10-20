import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveHeldOutReplayBytes,
  type ReplayManifestCase,
  type ReplayManifestSnapshot,
} from './held-out-replay-byte-resolver'

type AdminClient = ReturnType<typeof createAdminClient>
const HASH = /^sha256:[0-9a-f]{64}$/
const CASE_PAGE_SIZE = 500

function validateBucket(value: string) {
  const bucket = value.trim()
  if (!bucket || bucket.includes('/') || bucket === '.' || bucket === '..') throw new Error('REPLAY_BUCKET_INVALID')
  return bucket
}

function validateStorageKey(value: string, projectId: string) {
  const parts = value.replaceAll('\\', '/').split('/')
  if (value.includes('\\') || parts[0] !== 'learning' || parts[1] !== projectId
    || parts.some(part => !part || part === '.' || part === '..') || value.includes('://')) {
    throw new Error('REPLAY_STORAGE_KEY_INVALID')
  }
}

/**
 * Loads only persisted sealed-manifest rows, then retrieves and hashes exact
 * bytes from a private Storage bucket. Legacy rows without payload_hash fail
 * closed. This factory is server-only by construction at its call site.
 */
export async function loadSupabaseHeldOutReplayBytes(input: {
  client: AdminClient
  bucketName: string
  expected: {
    projectId: string
    manifestId: string
    datasetVersionId: string
    manifestHash: string
  }
  expectedCaseKeys: readonly string[]
}): Promise<Awaited<ReturnType<typeof resolveHeldOutReplayBytes>>> {
  const bucket = validateBucket(input.bucketName)
  const { projectId, manifestId, datasetVersionId, manifestHash } = input.expected
  const { data: header, error: headerError } = await input.client.schema('agent')
    .from('learning_benchmark_dataset_manifests')
    .select('id,project_id,dataset_version,evidence_cutoff_at,manifest_hash,status,case_count')
    .eq('id', manifestId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (headerError) throw new Error('REPLAY_MANIFEST_READ_FAILED')
  if (!header || header.id !== manifestId || header.project_id !== projectId || header.status !== 'SEALED'
    || header.dataset_version !== datasetVersionId
    || header.manifest_hash !== manifestHash) throw new Error('REPLAY_MANIFEST_STALE')

  const caseCount = Number(header.case_count)
  if (!Number.isSafeInteger(caseCount) || caseCount < 1) throw new Error('REPLAY_CASE_COUNT_INVALID')
  const rows: any[] = []
  for (let offset = 0; offset < caseCount; offset += CASE_PAGE_SIZE) {
    const end = Math.min(offset + CASE_PAGE_SIZE, caseCount) - 1
    const { data: page, error: casesError } = await input.client.schema('agent')
      .from('learning_benchmark_dataset_cases')
      .select('project_id,dataset_id,case_key,split,source_case_ref,payload_hash')
      .eq('project_id', projectId)
      .eq('dataset_id', manifestId)
      .order('case_key', { ascending: true })
      .range(offset, end)
    if (casesError) throw new Error('REPLAY_CASES_READ_FAILED')
    if (!Array.isArray(page) || page.length !== end - offset + 1) throw new Error('REPLAY_CASES_MISSING')
    rows.push(...page)
  }
  if (rows.length !== caseCount) throw new Error('REPLAY_CASES_MISSING')

  const cases: ReplayManifestCase[] = rows.map((row: any) => {
    if (row.project_id !== projectId || row.dataset_id !== manifestId) throw new Error('REPLAY_CASE_SCOPE_MISMATCH')
    if (typeof row.payload_hash !== 'string' || !HASH.test(row.payload_hash)) throw new Error('REPLAY_PAYLOAD_HASH_MISSING')
    if (typeof row.source_case_ref !== 'string') throw new Error('REPLAY_SOURCE_REFERENCE_INVALID')
    validateStorageKey(row.source_case_ref, projectId)
    return {
      caseKey: String(row.case_key),
      split: row.split,
      sourceCaseRef: row.source_case_ref,
      payloadHash: row.payload_hash,
    }
  })
  const manifest: ReplayManifestSnapshot = {
    projectId,
    manifestId,
    datasetVersionId: String(header.dataset_version),
    evidenceCutoffAt: String(header.evidence_cutoff_at),
    manifestHash: String(header.manifest_hash),
    cases,
  }
  const reader = {
    async read(sourceCaseRef: string) {
      const row = rows.find((item: any) => item.source_case_ref === sourceCaseRef)
      if (!row || row.project_id !== projectId || row.dataset_id !== manifestId || row.split !== 'HELD_OUT') return null
      validateStorageKey(row.source_case_ref, projectId)
      const { data, error } = await input.client.storage.from(bucket).download(row.source_case_ref)
      if (error) {
        const status = Number(error.statusCode ?? error.status)
        if (status === 404 || String(error.message ?? '').toLowerCase().includes('not found')) return null
        throw new Error('REPLAY_STORAGE_READ_FAILED')
      }
      if (!data) return null
      let bytes: string
      try {
        // Keep an initial UTF-8 BOM in the decoded string so re-encoding and
        // hashing covers exactly the bytes persisted in the sealed manifest.
        bytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await data.arrayBuffer())
      } catch {
        throw new Error('REPLAY_STORAGE_BYTES_INVALID')
      }
      return {
        projectId,
        manifestId,
        datasetVersionId,
        caseKey: String(row.case_key),
        sourceCaseRef: row.source_case_ref,
        bytes,
      }
    },
  }

  return resolveHeldOutReplayBytes({
    manifest,
    expected: { ...input.expected, evidenceCutoffAt: String(header.evidence_cutoff_at) },
    expectedCaseKeys: input.expectedCaseKeys,
    trainingCaseKeys: cases.filter(item => item.split === 'TRAINING').map(item => item.caseKey),
    reader,
  })
}
