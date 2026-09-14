import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dataGovernanceSuperAdminOrganizationIds } from '@/lib/auth/data-governance-super-admin'
import { CleanupConsole, type CleanupDataset, type CleanupProject, type CleanupSource } from './cleanup-console'

export default async function SuperAdminCleanupPage() {
  const user = await requireUser()
  const organizationIds = await dataGovernanceSuperAdminOrganizationIds(user.id)
  if (!organizationIds.length) redirect('/home')

  const admin = createAdminClient()
  const { data: organizations, error: organizationError } = await admin.schema('app').from('organizations').select('id,name').in('id', organizationIds).order('name')
  if (organizationError) throw new Error(`Unable to load Super Admin organizations: ${organizationError.message}`)

  const { data: projects, error: projectError } = await admin.schema('app').from('projects').select('id,organization_id,name,description').in('organization_id', organizationIds).order('name')
  if (projectError) throw new Error(`Unable to load Super Admin projects: ${projectError.message}`)
  const projectIds = (projects ?? []).map(project => String(project.id))

  const [sourcesResult, datasetsResult] = projectIds.length ? await Promise.all([
    admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').in('project_id', projectIds).order('name'),
    admin.schema('catalog').from('datasets').select('id,project_id,data_source_id,name,business_domain,status').in('project_id', projectIds).order('name'),
  ]) : [{ data: [], error: null }, { data: [], error: null }]

  if (sourcesResult.error) throw new Error(`Unable to load data sources: ${sourcesResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)

  const organizationById = new Map((organizations ?? []).map(org => [String(org.id), String(org.name)]))
  const projectRows: CleanupProject[] = (projects ?? []).map(project => ({
    id: String(project.id),
    organizationId: String(project.organization_id),
    organizationName: organizationById.get(String(project.organization_id)) ?? 'Organization',
    name: String(project.name),
    description: project.description ? String(project.description) : '',
  }))
  const sourceRows = (sourcesResult.data ?? []) as CleanupSource[]
  const datasetRows = (datasetsResult.data ?? []) as CleanupDataset[]

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <Link href="/home" className="font-black">DataNexus</Link>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/cleanup" className="rounded-xl bg-slate-950 px-3 py-2 font-semibold text-white">Super Admin Cleanup</Link>
          <Link href="/datasets" className="rounded-xl px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50">Datasets & Sources</Link>
          <Link href="/monitoring" className="rounded-xl px-3 py-2 font-semibold text-cyan-700 hover:bg-cyan-50">Job Monitor</Link>
        </div>
      </nav>
      <CleanupConsole projects={projectRows} sources={sourceRows} datasets={datasetRows} />
    </div>
  </main>
}
