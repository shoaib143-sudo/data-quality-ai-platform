import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceUri = text(body.sourceUri)
    if (!projectId || !sourceUri) return NextResponse.json({ error: 'projectId and sourceUri are required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const executionConfig = /^https?:\/\//i.test(sourceUri)
      ? { url: sourceUri }
      : { bucket: sourceUri.split('/')[0], path: sourceUri.split('/').slice(1).join('/') }

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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'FILE discovery failed.' }, { status: 400 })
  }
}
