import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { createObjectStorage, defaultStorageProvider } from '@/lib/storage/factory'

const SUPABASE_DATASET_BUCKET = 'dataset-files'
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024
const SIGNED_URL_TTL_SECONDS = 15 * 60
const ALLOWED_EXTENSIONS = new Set([
  'csv', 'json', 'jsonl', 'ndjson', 'txt', 'md', 'markdown', 'log', 'xml', 'yaml', 'yml',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp',
])

function boundedMaxBytes() {
  const parsed = Number(process.env.FILE_TECHNICAL_MAX_BYTES)
  return Number.isFinite(parsed)
    ? Math.min(1024 * 1024 * 1024, Math.max(1024 * 1024, Math.floor(parsed)))
    : DEFAULT_MAX_BYTES
}

function safeFileName(name: string) {
  const base = name.replaceAll('\\', '/').split('/').pop()?.trim() || 'dataset-file'
  const sanitized = base
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
  if (!sanitized || sanitized === '.' || sanitized === '..') throw new Error('Uploaded file name is invalid.')
  return sanitized
}

function extension(name: string) {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
}

function r2Prefix() {
  return (process.env.R2_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '')
}

function canonicalUploadPath(projectId: string, path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const providerPrefix = r2Prefix()
  const expected = `projects/${projectId}/uploads/`
  const candidate = providerPrefix && normalized.startsWith(`${providerPrefix}/`)
    ? normalized.slice(providerPrefix.length + 1)
    : normalized
  if (!candidate.startsWith(expected) || candidate.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Dataset upload path is outside the authorized project scope.')
  }
  return candidate
}

function datasetBucket(provider: 'supabase' | 'r2') {
  if (provider === 'r2') {
    const bucket = process.env.R2_BUCKET?.trim()
    if (!bucket) throw new Error('R2_BUCKET is required when R2 is the default storage provider.')
    return bucket
  }
  return SUPABASE_DATASET_BUCKET
}

export async function POST(request: Request) {
  let storageObjectId: string | undefined
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const originalName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    const contentType = typeof body.contentType === 'string' && body.contentType.trim() ? body.contentType.trim() : 'application/octet-stream'
    const size = Number(body.size)

    if (!projectId || !originalName || !Number.isFinite(size)) {
      return NextResponse.json({ error: 'projectId, fileName, and size are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'source.manage')

    const maxBytes = boundedMaxBytes()
    if (size <= 0) return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 })
    if (size > maxBytes) {
      return NextResponse.json({ error: `Uploaded file exceeds the technical safety ceiling of ${maxBytes} bytes.` }, { status: 413 })
    }

    const fileName = safeFileName(originalName)
    const ext = extension(fileName)
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported dataset file type: ${ext || 'unknown'}.` }, { status: 415 })
    }

    const provider = defaultStorageProvider()
    const storage = createObjectStorage(provider)
    const bucket = datasetBucket(provider)
    const objectKey = `projects/${projectId}/uploads/${Date.now()}-${crypto.randomUUID()}-${fileName}`
    const persistedKey = provider === 'r2' && r2Prefix() ? `${r2Prefix()}/${objectKey}` : objectKey
    const admin = createAdminClient()
    const { data: storageObject, error: registryError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .insert({
        project_id: projectId,
        provider,
        bucket,
        object_key: persistedKey,
        object_type: 'DATASET_SOURCE',
        owner_type: 'UPLOAD',
        original_filename: fileName,
        content_type: contentType,
        expected_size_bytes: size,
        state: 'PENDING',
        created_by: user.id,
        metadata: { extension: ext },
      })
      .select('id')
      .single()
    if (registryError || !storageObject?.id) {
      throw new Error(`Unable to register dataset upload: ${registryError?.message ?? 'missing storage object id'}`)
    }
    storageObjectId = storageObject.id

    try {
      const authorization = await storage.createUploadAuthorization({
        bucket,
        key: objectKey,
        contentType,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      })
      const { error: stateError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({ state: 'UPLOADING', updated_at: new Date().toISOString() })
        .eq('id', storageObjectId)
        .eq('project_id', projectId)
      if (stateError) throw new Error(`Unable to activate dataset upload: ${stateError.message}`)

      return NextResponse.json({
        storageObjectId,
        provider: authorization.provider,
        bucket: authorization.bucket,
        path: authorization.key,
        key: authorization.key,
        token: authorization.token,
        uploadUrl: authorization.url,
        uploadHeaders: authorization.requiredHeaders,
        expiresAt: authorization.expiresAt,
        sourceUri: `${authorization.provider}://${authorization.bucket}/${authorization.key}`,
        file: { name: fileName, size, contentType, extension: ext },
      })
    } catch (authorizationError) {
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'FAILED',
          updated_at: new Date().toISOString(),
          metadata: { extension: ext, failure_stage: 'AUTHORIZATION' },
        })
        .eq('id', storageObjectId)
        .eq('project_id', projectId)
      throw authorizationError
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset file upload authorization failed.', storageObjectId }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const path = typeof body.path === 'string' ? body.path.trim() : ''
    const storageObjectId = typeof body.storageObjectId === 'string' ? body.storageObjectId.trim() : ''
    const requestedProvider = body.provider === 'r2' || body.provider === 'supabase' ? body.provider : defaultStorageProvider()
    if (!projectId || !path) return NextResponse.json({ error: 'projectId and path are required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'source.manage')
    const objectKey = canonicalUploadPath(projectId, path)
    const bucket = datasetBucket(requestedProvider)
    const prefix = r2Prefix()
    const key = requestedProvider === 'r2' && prefix ? `${prefix}/${objectKey}` : objectKey
    const admin = createAdminClient()

    let registryQuery = admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, state')
      .eq('project_id', projectId)
      .eq('provider', requestedProvider)
      .eq('bucket', bucket)
      .eq('object_key', key)
    if (storageObjectId) registryQuery = registryQuery.eq('id', storageObjectId)
    const { data: registryObject, error: registryLookupError } = await registryQuery.maybeSingle()
    if (registryLookupError) throw new Error(`Unable to verify upload cleanup target: ${registryLookupError.message}`)
    if (!registryObject) return NextResponse.json({ error: 'Registered upload object not found.' }, { status: 404 })
    if (registryObject.state === 'READY') {
      return NextResponse.json({ error: 'READY dataset sources cannot be removed through upload cleanup.' }, { status: 409 })
    }
    if (registryObject.state === 'DELETED') {
      return NextResponse.json({ removed: true, idempotent: true })
    }

    const { data: referencedVersion, error: referenceError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id')
      .eq('storage_object_id', registryObject.id)
      .limit(1)
      .maybeSingle()
    if (referenceError) throw new Error(`Unable to verify dataset version references: ${referenceError.message}`)
    if (referencedVersion) {
      return NextResponse.json({ error: 'Storage object is referenced by a dataset version and cannot be removed through upload cleanup.' }, { status: 409 })
    }

    const storage = createObjectStorage(requestedProvider)
    await storage.deleteObject({ provider: requestedProvider, bucket, key })

    const now = new Date().toISOString()
    const { error: registryError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .update({ state: 'DELETED', deleted_at: now, updated_at: now })
      .eq('id', registryObject.id)
      .eq('project_id', projectId)
      .neq('state', 'READY')
    if (registryError) throw new Error(`Object deleted but registry update failed: ${registryError.message}`)

    return NextResponse.json({ removed: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset upload cleanup failed.' }, { status: 500 })
  }
}
