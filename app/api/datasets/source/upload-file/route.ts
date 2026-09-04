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
  const value = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
  return value
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const form = await request.formData()
    const projectId = String(form.get('projectId') ?? '').trim()
    const file = form.get('file')

    if (!projectId || !(file instanceof File)) {
      return NextResponse.json({ error: 'projectId and file are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'source.manage')

    const maxBytes = boundedMaxBytes()
    if (file.size <= 0) return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 })
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `Uploaded file exceeds the technical safety ceiling of ${maxBytes} bytes.` }, { status: 413 })
    }

    const fileName = safeFileName(file.name)
    const ext = extension(fileName)
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported dataset file type: ${ext || 'unknown'}.` }, { status: 415 })
    }

    const objectPath = `projects/${projectId}/uploads/${Date.now()}-${crypto.randomUUID()}-${fileName}`
    const admin = createAdminClient()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await admin.storage.from(DATASET_BUCKET).upload(objectPath, bytes, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw new Error(`Unable to upload dataset file: ${error.message}`)

    return NextResponse.json({
      bucket: DATASET_BUCKET,
      path: objectPath,
      sourceUri: `${DATASET_BUCKET}/${objectPath}`,
      file: { name: fileName, size: file.size, contentType: file.type || null, extension: ext },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset file upload failed.' }, { status: 500 })
  }
}
