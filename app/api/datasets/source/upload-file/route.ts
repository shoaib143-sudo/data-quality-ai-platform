import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'

const DATASET_BUCKET = 'dataset-files'
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024
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

export async function POST(request: Request) {
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

    const objectPath = `projects/${projectId}/uploads/${Date.now()}-${crypto.randomUUID()}-${fileName}`
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(DATASET_BUCKET).createSignedUploadUrl(objectPath, { upsert: false })
    if (error || !data?.token) throw new Error(`Unable to authorize dataset upload: ${error?.message ?? 'missing signed upload token'}`)

    return NextResponse.json({
      bucket: DATASET_BUCKET,
      path: objectPath,
      token: data.token,
      sourceUri: `${DATASET_BUCKET}/${objectPath}`,
      file: { name: fileName, size, contentType, extension: ext },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset file upload authorization failed.' }, { status: 500 })
  }
}
