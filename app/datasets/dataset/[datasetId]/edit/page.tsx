import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { EditDatasetForm } from './edit-dataset-form'

export default async function EditDatasetPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const user = await requireUser()
  const { datasetId } = await params
  const supabase = await createClient()

  const { data: dataset } = await supabase.schema('catalog').from('datasets').select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status').eq('id', datasetId).maybeSingle()
  if (!dataset) notFound()

  const { data: project } = await supabase.schema('app').from('projects').select('id, name, organization_id').eq('id', dataset.project_id).maybeSingle()
  if (!project) notFound()

  const { data: membership } = await supabase.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
  if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) notFound()

  const { data: sources } = await supabase.schema('catalog').from('data_sources').select('id, name, source_type, status').eq('project_id', dataset.project_id).in('status', ['ACTIVE', 'CONFIGURED']).order('name')

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link href="/datasets" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to datasets</Link>
        <h1 className="mt-3 text-3xl font-bold">Edit dataset</h1>
        <p className="mt-2 text-sm text-slate-600">Update business context, connection binding, and source object. The updated source is validated before it is saved.</p>
      </div>
      <EditDatasetForm
        dataset={{
          id: dataset.id,
          projectId: dataset.project_id,
          projectName: project.name,
          sourceId: dataset.data_source_id ?? '',
          name: dataset.name,
          description: dataset.description ?? '',
          sourceIdentifier: dataset.source_identifier ?? '',
          businessDomain: dataset.business_domain ?? '',
        }}
        sources={(sources ?? []).map(source => ({ id: source.id, name: source.name, sourceType: source.source_type, status: source.status }))}
      />
    </div>
  </main>
}
