import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function parseCsvHeader(textValue: string) {
  const firstLine = textValue.split(/\r?\n/, 1)[0] ?? ''
  const columns: string[] = []
  let current = '', quoted = false
  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index]
    if (char === '"') {
      if (quoted && firstLine[index + 1] === '"') { current += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) { columns.push(current.trim()); current = '' }
    else current += char
  }
  columns.push(current.trim())
  return columns.map((column, index) => column || `column_${index + 1}`)
}

async function loadCsv(sourceUri: string, admin: ReturnType<typeof createAdminClient>) {
  if (/^https?:\/\//i.test(sourceUri)) {
    const response = await fetch(sourceUri, { cache: 'no-store' })
    if (!response.ok) throw new Error(`CSV source returned HTTP ${response.status}.`)
    return response.text()
  }
  const [bucket, ...pathParts] = sourceUri.split('/')
  const path = pathParts.join('/')
  if (!bucket || !path) throw new Error('CSV source must be an HTTPS URL or storage bucket/path.')
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) throw new Error(`Unable to read CSV from Supabase Storage: ${error?.message ?? 'object not found'}`)
  return data.text()
}

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
    const csv = await loadCsv(sourceUri, admin)
    const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0)
    if (lines.length === 0) return NextResponse.json({ error: 'CSV file is empty.' }, { status: 422 })
    const columns = parseCsvHeader(csv)
    if (columns.length === 0) return NextResponse.json({ error: 'CSV header could not be discovered.' }, { status: 422 })
    return NextResponse.json({ sourceUri, columns: columns.map(name => ({ name, type: 'text' })), tables: [{ name: sourceUri.split('/').pop() || 'csv', type: 'FILE' }], rowCount: Math.max(lines.length - 1, 0) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'CSV discovery failed.' }, { status: 400 })
  }
}
