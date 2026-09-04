import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function storageExecutionConfig(sourceUri: string) {
  const normalized = sourceUri.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = normalized.split('/')
  if (parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Storage FILE sourceUri must use bucket/path syntax with a normalized object path.')
  }
  return { bucket: parts[0], path: parts.slice(1).join('/') }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceUri = text(body.sourceUri)
    if (!projectId || !sourceUri) return NextResponse.json({ error: 'projectId and sourceUri are required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')

    const admin = createAdminClient()
    const executionConfig = /^https?:\/\//i.test(sourceUri)
      ? { url: sourceUri }
      : storageExecutionConfig(sourceUri)

    const loaded = await loadFileSource(admin, { sourceUri, executionConfig }, { maxRows: 1000 })
    const firstRow = loaded.rows[0] ?? {}
    const columns = Array.from(
      loaded.rows.reduce<Set<string>>((names, row) => {
        Object.keys(row).forEach((name) => names.add(name))
        return names
      }, new Set(Object.keys(firstRow))),
    ).map((name) => {
      const sample = loaded.rows.find((row) => row[name] !== null && row[name] !== undefined)?.[name]
      const type = Array.isArray(sample) ? 'array' : sample === null || sample === undefined ? 'unknown' : typeof sample
      return { name, type }
    })

    return NextResponse.json({
      sourceUri: loaded.sourceUri,
      format: loaded.format,
      contentType: loaded.contentType,
      metadata: loaded.metadata,
      columns,
      tables: [{ name: String(loaded.metadata.file_name ?? sourceUri.split('/').pop() ?? 'file'), type: loaded.format === 'binary' ? 'FILE_METADATA' : 'FILE' }],
      rowCount: loaded.rowCount,
      sampledRows: loaded.rows.length,
      warnings: loaded.warnings,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'FILE discovery failed.' }, { status: 400 })
  }
}
