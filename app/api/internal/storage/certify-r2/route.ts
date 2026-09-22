import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalAutomation } from '@/lib/security/internal-bearer'
import { readR2CorsPolicy, r2CorsHasWildcardOrigin, r2CorsPolicyMatchesDesired } from '@/lib/storage/r2-cors'
import { listR2ObjectKeysByPrefix } from '@/lib/storage/r2'

export const dynamic = 'force-dynamic'

type StorageRow = {
  id: string
  provider: 'supabase' | 'r2'
  state: string
  owner_type: string
  size_bytes: number | null
  checksum: string | null
  checksum_algorithm: string | null
  verified_at: string | null
  metadata: Record<string, unknown> | null
}

type VersionRow = {
  storage_object_id: string | null
}

function hasR2RuntimeConfiguration() {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_PREFIX']
    .every((name) => Boolean(process.env[name]?.trim()))
}

function selectedProvider() {
  const value = (process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase').trim().toLowerCase()
  return value === 'r2' ? 'r2' : 'supabase'
}

function productionCutoverApproved() {
  return process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
}

function sourceStorageId(row: StorageRow) {
  const value = row.metadata?.source_storage_object_id
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const CERTIFICATION_PAGE_SIZE = 1000
const CERTIFICATION_MAX_ROWS = 100_000

export async function GET(request: Request) {
  if (!(await requireInternalAutomation(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createAdminClient()

  async function loadStorageRows() {
    const rows: StorageRow[] = []
    for (let from = 0; from < CERTIFICATION_MAX_ROWS; from += CERTIFICATION_PAGE_SIZE) {
      const result = await admin
        .schema('catalog')
        .from('storage_objects')
        .select('id, provider, state, owner_type, size_bytes, checksum, checksum_algorithm, verified_at, metadata')
        .order('id', { ascending: true })
        .range(from, from + CERTIFICATION_PAGE_SIZE - 1)
      if (result.error) return { rows: [] as StorageRow[], error: result.error.message }
      const page = (result.data ?? []) as StorageRow[]
      rows.push(...page)
      if (page.length < CERTIFICATION_PAGE_SIZE) return { rows, error: undefined }
    }
    return { rows: [] as StorageRow[], error: `storage_objects inventory exceeds bounded certification ceiling of ${CERTIFICATION_MAX_ROWS} rows` }
  }

  async function loadVersionRows() {
    const rows: VersionRow[] = []
    for (let from = 0; from < CERTIFICATION_MAX_ROWS; from += CERTIFICATION_PAGE_SIZE) {
      const result = await admin
        .schema('catalog')
        .from('dataset_versions')
        .select('storage_object_id')
        .not('storage_object_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + CERTIFICATION_PAGE_SIZE - 1)
      if (result.error) return { rows: [] as VersionRow[], error: result.error.message }
      const page = (result.data ?? []) as VersionRow[]
      rows.push(...page)
      if (page.length < CERTIFICATION_PAGE_SIZE) return { rows, error: undefined }
    }
    return { rows: [] as VersionRow[], error: `dataset_versions inventory exceeds bounded certification ceiling of ${CERTIFICATION_MAX_ROWS} rows` }
  }

  const [storageResult, versionsResult] = await Promise.all([loadStorageRows(), loadVersionRows()])

  if (storageResult.error || versionsResult.error) {
    return NextResponse.json({
      certified: false,
      error: `R2 certification database query failed: ${storageResult.error ?? versionsResult.error}`,
    }, { status: 503 })
  }

  const storageRows = storageResult.rows
  const versionRows = versionsResult.rows
  const storageById = new Map(storageRows.map((row) => [row.id, row]))
  const referencedIds = new Set(versionRows.flatMap((row) => row.storage_object_id ? [row.storage_object_id] : []))
  const referencedProviderCounts = [...referencedIds].reduce((counts, id) => {
    const provider = storageById.get(id)?.provider
    if (provider === 'supabase' || provider === 'r2') counts[provider] += 1
    return counts
  }, { supabase: 0, r2: 0 })

  const legacyAwaitingVerification = storageRows.filter(
    (row) => row.provider === 'supabase' && row.owner_type === 'LEGACY_UPLOAD' && row.state !== 'READY' && row.state !== 'DELETED',
  ).length
  const referencedNonReady = [...referencedIds].filter((id) => storageById.get(id)?.state !== 'READY').length
  const readyMissingIntegrityMetadata = storageRows.filter(
    (row) => row.state === 'READY' && (!row.verified_at || row.size_bytes == null),
  ).length
  const r2NonReadyObjects = storageRows.filter(
    (row) => row.provider === 'r2' && row.state !== 'READY' && row.state !== 'DELETED',
  ).length
  const readyMigrationCopies = storageRows.filter(
    (row) => row.provider === 'r2'
      && row.owner_type === 'MIGRATION_COPY'
      && row.state === 'READY'
      && row.size_bytes != null
      && row.checksum_algorithm === 'sha256'
      && Boolean(row.checksum)
      && Boolean(sourceStorageId(row)),
  )
  const migrationSources = new Set(readyMigrationCopies.map(sourceStorageId).filter((value): value is string => Boolean(value)))
  const verifiedMigrationPairs = [...migrationSources].filter((sourceId) => {
    const source = storageById.get(sourceId)
    const target = readyMigrationCopies.find((candidate) => sourceStorageId(candidate) === sourceId)
    return Boolean(source
      && target
      && source.provider === 'supabase'
      && source.state === 'READY'
      && source.size_bytes != null
      && Number(source.size_bytes) === Number(target.size_bytes)
      && source.checksum_algorithm === 'sha256'
      && Boolean(source.checksum)
      && source.checksum === target.checksum)
  }).length

  const r2RuntimeConfigured = hasR2RuntimeConfiguration()
  let corsConfigured = false
  let corsMatchesDesiredPolicy = false
  let corsWildcardOriginDetected = false
  let assuranceResidueChecked = false
  let assuranceResidueCount = 0
  let assuranceResidueSample: string[] = []
  let assuranceResidueTruncated = false
  let assuranceResidueCheckError: string | undefined
  let corsCheckError: string | undefined
  if (r2RuntimeConfigured) {
    try {
      const xml = await readR2CorsPolicy()
      corsConfigured = true
      corsMatchesDesiredPolicy = r2CorsPolicyMatchesDesired(xml)
      corsWildcardOriginDetected = r2CorsHasWildcardOrigin(xml)
    } catch (error) {
      corsCheckError = error instanceof Error ? error.message : 'R2 CORS inspection failed.'
    }
  }

  if (r2RuntimeConfigured) {
    try {
      const residue = await listR2ObjectKeysByPrefix({ prefix: '_assurance', maxKeys: 100 })
      assuranceResidueChecked = true
      assuranceResidueCount = residue.keys.length
      assuranceResidueSample = residue.keys.slice(0, 10)
      assuranceResidueTruncated = residue.truncated
    } catch (error) {
      assuranceResidueCheckError = error instanceof Error ? error.message : 'R2 assurance residue inspection failed.'
    }
  }

  const blockers: string[] = []
  if (!r2RuntimeConfigured) blockers.push('R2_RUNTIME_CONFIGURATION_INCOMPLETE')
  if (legacyAwaitingVerification > 0) blockers.push('LEGACY_OBJECTS_AWAITING_VERIFICATION')
  if (referencedNonReady > 0) blockers.push('DATASET_VERSION_REFERENCES_NON_READY_OBJECT')
  if (readyMissingIntegrityMetadata > 0) blockers.push('READY_OBJECTS_MISSING_INTEGRITY_METADATA')
  if (r2NonReadyObjects > 0) blockers.push('R2_NON_READY_OBJECTS_PRESENT')
  if (readyMigrationCopies.length === 0) blockers.push('NO_READY_R2_MIGRATION_COPY')
  if (readyMigrationCopies.length !== verifiedMigrationPairs) blockers.push('R2_MIGRATION_PAIR_INTEGRITY_INCOMPLETE')
  if (!corsConfigured || !corsMatchesDesiredPolicy || corsWildcardOriginDetected) blockers.push('R2_CORS_NOT_CERTIFIED')
  if (!assuranceResidueChecked || assuranceResidueCheckError) blockers.push('R2_ASSURANCE_RESIDUE_CHECK_FAILED')
  if (assuranceResidueCount > 0 || assuranceResidueTruncated) blockers.push('R2_ASSURANCE_OBJECTS_PRESENT')

  const defaultProvider = selectedProvider()
  const cutoverApproved = productionCutoverApproved()
  const preCutoverReady = blockers.length === 0
  const productionCutoverActive = defaultProvider === 'r2' && cutoverApproved

  return NextResponse.json({
    certified: preCutoverReady,
    generatedAt: new Date().toISOString(),
    blockers,
    database: {
      legacyAwaitingVerification,
      referencedNonReady,
      readyMissingIntegrityMetadata,
      r2NonReadyObjects,
      readyMigrationCopies: readyMigrationCopies.length,
      verifiedMigrationPairs,
      referencedProviderCounts,
    },
    cors: {
      configured: corsConfigured,
      matchesDesiredPolicy: corsMatchesDesiredPolicy,
      wildcardOriginDetected: corsWildcardOriginDetected,
      checkError: corsCheckError,
    },
    assuranceResidue: {
      checked: assuranceResidueChecked,
      objectCount: assuranceResidueCount,
      sampleKeys: assuranceResidueSample,
      truncated: assuranceResidueTruncated,
      checkError: assuranceResidueCheckError,
    },
    runtime: {
      r2RuntimeConfigured,
      defaultProvider,
      productionCutoverApproved: cutoverApproved,
      productionCutoverActive,
    },
    destructiveActions: 0,
  }, { status: preCutoverReady ? 200 : 503 })
}
