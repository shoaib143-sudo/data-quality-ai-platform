import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { EditSourceForm } from './edit-source-form'
import { hierarchySelection } from '@/lib/connectors/native-hierarchy'

export default async function EditSourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const user = await requireUser()
  const { sourceId } = await params
  const supabase = await createClient()
  const { data: source } = await supabase.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).maybeSingle()
  if (!source) notFound()
  const { data: project } = await supabase.schema('app').from('projects').select('id, name, organization_id').eq('id', source.project_id).maybeSingle()
  if (!project) notFound()
  const { data: membership } = await supabase.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
  if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) notFound()
  const metadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? source.connection_metadata as Record<string, unknown> : {}

  if (String(source.source_type).toUpperCase() !== 'JDBC') {
    return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6"><div className="mx-auto max-w-4xl"><Link href="/datasets" className="text-sm font-semibold text-blue-600">Back to connections</Link><h1 className="my-5 text-3xl font-bold">Edit connection</h1><p className="rounded-xl border bg-white p-5 text-sm text-slate-600">This source is not a database/JDBC connection. Manage its source file or application-specific configuration from the corresponding connector.</p></div></main>
  }

  const selection = hierarchySelection(metadata.hierarchy_selection)
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6"><div className="mx-auto max-w-4xl">
    <Link href="/datasets" className="text-sm font-semibold text-blue-600">Back to connections</Link>
    <h1 className="my-5 text-3xl font-bold">Edit database connection</h1>
    <EditSourceForm source={{
      id: source.id,
      projectId: source.project_id,
      projectName: project.name,
      name: source.name,
      sourceType: source.source_type,
      connectionKind: String(metadata.connection_kind ?? 'jdbc'),
      jdbcUrl: String(metadata.jdbc_url ?? ''),
      credentialRef: String(metadata.credential_ref ?? ''),
      hierarchySelection: selection,
      status: source.status,
    }} />
  </div></main>
}
