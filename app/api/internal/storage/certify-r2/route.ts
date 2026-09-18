import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalAutomation } from '@/lib/security/internal-bearer'
import { readR2CorsPolicy, r2CorsHasWildcardOrigin, r2CorsPolicyMatchesDesired } from '@/lib/storage/r2-cors'

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

export async function GET(request: Request) {
  if (!(await requireInternalAutomation(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createAdminClient()
  const [storageResult, versionsResult] = await Promise.all([
    admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, provider, state, owner_type, size_bytes, checksum, checksum_algorithm, verified_at, metadata'),
    admin
      .schema('catalog')
      .from('dataset_versions')
      .select('storage_object_id')
      .not('storage_object_id', 'is', null),
  ])

  if (storageResult.error || versionsResult.error) {
    return NextResponse.json({
      certified: false,
      error: `R2 certification database query failed: ${storageResult.error?.message ?? versionsResult.error?.message}`,
    }, { status: 503 })
  }

  const storageRows = (storageResult.data ?? []) as StorageRow[]
  const versionRows = (versionsResult.data ?? []) as VersionRow[]
  const storageById = new Map(storageRows.map((row) => [row.id, row]))
  const referencedIds = new Set(versionRows.flatMap((row) => row.storage_object_id ? [row.storage_object_id] : []))

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
  const verifiedMigrationSourceIds = new Set([...migrationSources].filter((sourceId) => {
    const source = storageById.get(sourceId)
    const target = readyMigrationCopies.find((candidate) => sourceStorageId(candidate) === sourceId)
    return Boolean(source
      && target
      && source.provider === 'supabase'
      && source.state === 'READY'
      && source.size_bytes != null
      && Number(source.size_bytes) === Number(target.size_bytes)
      && (!source.checksum || source.checksum_algorithm !== 'sha256' || source.checksum === target.checksum))
  }))
  const verifiedMigrationPairs = verifiedMigrationSourceIds.size
  const referencedStorageRows = [...referencedIds]
    .map((id) => storageById.get(id))
    .filter((row): row is StorageRow => Boolean(row))
  const referencedSupabaseObjects = referencedStorageRows.filter((row) => row.provider === 'supabase').length
  const referencedR2Objects = referencedStorageRows.filter((row) => row.provider === 'r2').length
  const referencedSupabaseWithoutVerifiedMigration = referencedStorageRows.filter(
    (row) => row.provider === 'supabase' && !verifiedMigrationSourceIds.has(row.id),
  ).length

  const r2RuntimeConfigured = hasR2RuntimeConfiguration()
  let corsConfigured = false
  let corsMatchesDesiredPolicy = false
  let corsWildcardOriginDetected = false
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

  const blockers: string[] = []
  if (!r2RuntimeConfigured) blockers.push('R2_RUNTIME_CONFIGURATION_INCOMPLETE')
  if (legacyAwaitingVerification > 0) blockers.push('LEGACY_OBJECTS_AWAITING_VERIFICATION')
  if (referencedNonReady > 0) blockers.push('DATASET_VERSION_REFERENCES_NON_READY_OBJECT')
  if (readyMissingIntegrityMetadata > 0) blockers.push('READY_OBJECTS_MISSING_INTEGRITY_METADATA')
  if (r2NonReadyObjects > 0) blockers.push('R2_NON_READY_OBJECTS_PRESENT')
  if (readyMigrationCopies.length === 0) blockers.push('NO_READY_R2_MIGRATION_COPY')
  if (readyMigrationCopies.length !== verifiedMigrationPairs) blockers.push('R2_MIGRATION_PAIR_INTEGRITY_INCOMPLETE')
  if (referencedSupabaseWithoutVerifiedMigration > 0) blockers.push('REFERENCED_SUPABASE_OBJECTS_MISSING_VERIFIED_R2_COPY')
  if (!corsConfigured || !corsMatchesDesiredPolicy || corsWildcardOriginDetected) blockers.push('R2_CORS_NOT_CERTIFIED')

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
      referencedSupabaseObjects,
      referencedR2Objects,
      referencedSupabaseWithoutVerifiedMigration,
    },
    cors: {
      configured: corsConfigured,
      matchesDesiredPolicy: corsMatchesDesiredPolicy,
      wildcardOriginDetected: corsWildcardOriginDetected,
      checkError: corsCheckError,
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
