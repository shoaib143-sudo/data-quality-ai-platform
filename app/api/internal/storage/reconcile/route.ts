import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageProvider, StorageReference } from '@/lib/storage/contracts'

export const dynamic = 'force-dynamic'

const DEFAULT_STALE_MINUTES = 30
const MAX_BATCH = 100

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${expected}`
}

function staleMinutes() {
  const parsed = Number(process.env.STORAGE_RECONCILE_STALE_MINUTES)
  return Number.isFinite(parsed) ? Math.min(24 * 60, Math.max(5, Math.floor(parsed))) : DEFAULT_STALE_MINUTES
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - staleMinutes() * 60_000).toISOString()
  const { data: rows, error } = await admin
    .schema('catalog')
    .from('storage_objects')
    .select('id, project_id, provider, bucket, object_key, state, metadata, updated_at')
    .in('state', ['PENDING', 'UPLOADING', 'VERIFYING'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(MAX_BATCH)
  if (error) return NextResponse.json({ error: `Unable to load stale storage objects: ${error.message}` }, { status: 500 })

  const results: Array<Record<string, unknown>> = []
  for (const row of rows ?? []) {
    const provider = row.provider as StorageProvider
    if (provider !== 'r2' && provider !== 'supabase') {
      results.push({ id: row.id, action: 'SKIPPED', reason: 'UNSUPPORTED_PROVIDER' })
      continue
    }

    const reference: StorageReference = { provider, bucket: row.bucket, key: row.object_key }
    try {
      const head = await createObjectStorage(provider).headObject(reference)
      const now = new Date().toISOString()
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {}

      if (!head.exists) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'FAILED',
            updated_at: now,
            metadata: { ...metadata, reconciliation: 'MISSING_STALE_OBJECT', reconciled_at: now },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', row.state)
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'FAILED_MISSING_OBJECT' })
        continue
      }

      const { error: updateError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'UPLOADED',
          size_bytes: head.sizeBytes ?? null,
          etag: head.etag ?? null,
          updated_at: now,
          metadata: { ...metadata, reconciliation: 'OBJECT_FOUND_REQUIRES_VERIFICATION', reconciled_at: now },
        })
        .eq('id', row.id)
        .eq('project_id', row.project_id)
        .eq('state', row.state)
      if (updateError) throw new Error(updateError.message)
      results.push({ id: row.id, action: 'RECOVERED_TO_UPLOADED' })
    } catch (reconcileError) {
      results.push({ id: row.id, action: 'ERROR', error: reconcileError instanceof Error ? reconcileError.message : 'reconciliation failed' })
    }
  }

  return NextResponse.json({
    cutoff,
    examined: rows?.length ?? 0,
    results,
    destructiveActions: 0,
  })
}
