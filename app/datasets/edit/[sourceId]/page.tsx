import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { EditSourceForm } from './edit-source-form'
import { JdbcSourceForm } from '../../jdbc-source-form'
import { readSchemaScope } from '@/lib/connectors/schema-scope'

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
  if (metadata.connection_kind === 'databricks') {
    const jdbcUrl = String(metadata.jdbc_url ?? '')
    const scope = readSchemaScope(metadata)
    return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6"><div className="mx-auto max-w-4xl">
      <Link href="/datasets" className="text-sm font-semibold text-blue-600">Back to connections</Link>
      <h1 className="my-5 text-3xl font-bold">Edit Databricks connection</h1>
      <JdbcSourceForm projects={[{ id: project.id, name: project.name }]} organizations={[]} initialSource={{
        id: source.id, name: source.name,
        host: jdbcUrl.match(/^jdbc:databricks:\/\/([^:;/]+)/i)?.[1] ?? '',
        httpPath: jdbcUrl.match(/(?:[?&;])httpPath=([^;?&]+)/i)?.[1] ?? '',
        catalog: String(metadata.catalog ?? jdbcUrl.match(/(?:[?&;])ConnCatalog=([^;?&]+)/i)?.[1] ?? ''),
        schemaScope: scope.schemaScope, schemas: scope.schemas,
        credentialRef: String(metadata.credential_ref ?? ''),
      }} />
    </div></main>
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6"><div className="mx-auto max-w-4xl"><div className="mb-6"><Link href="/datasets" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to connections</Link><h1 className="mt-3 text-3xl font-bold">Edit connection</h1><p className="mt-2 text-sm text-slate-600">Update the connection details, enter the credentials again, test the connection, and save the verified configuration.</p></div><EditSourceForm source={{ id: source.id, projectId: source.project_id, projectName: project.name, name: source.name, sourceType: source.source_type, connectionKind: String(metadata.connection_kind ?? 'jdbc'), jdbcUrl: String(metadata.jdbc_url ?? ''), schema: String(metadata.schema ?? ''), table: String(metadata.table ?? ''), status: source.status }} /></div></main>
}
