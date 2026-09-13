import Link from 'next/link'
import { BookMarked, Layers3 } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { resolvePreferredGovernanceProject } from '@/lib/governance/preferred-project'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { GlossaryManager } from './glossary-manager'

export default async function GlossaryPage() {
  const user = await requireUser()
  const [supabase, preferredProjectId, landing] = await Promise.all([
    createClient(),
    resolvePreferredGovernanceProject(user.id),
    resolveLandingAccess(user.id),
  ])
  const [projects, datasets, terms, sources] = await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('governance').from('glossary_terms').select('*,glossary_mappings(*),glossary_term_versions(id,version_number,status,authority_type,change_kind,created_at)').order('term'),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name').order('name'),
  ])
  for (const result of [projects, datasets, terms, sources]) if (result.error) throw new Error(result.error.message)

  const orderedProjects = [...(projects.data ?? [])].sort((left, right) => {
    if (left.id === preferredProjectId) return -1
    if (right.id === preferredProjectId) return 1
    return left.name.localeCompare(right.name)
  })
  const manageableProjectIds = (await Promise.all((projects.data ?? []).map(async project => [String(project.id), await hasProjectCapability(user.id, String(project.id), 'glossary.manage')] as const)))
    .filter(([, allowed]) => allowed)
    .map(([projectId]) => projectId)
  const sourceProject = new Map((sources.data ?? []).map(source => [source.id, source.project_id]))
  const sourceIds = [...sourceProject.keys()]
  const assets = sourceIds.length
    ? await supabase.schema('catalog').from('discovered_assets')
      .select('id,source_id,asset_key,name,namespace,identity_key,columns')
      .in('source_id', sourceIds)
      .eq('is_current', true)
      .order('asset_key')
    : { data: [], error: null }
  if (assets.error) throw new Error(assets.error.message)

  const catalogAssets = (assets.data ?? []).map(asset => ({
    ...asset,
    project_id: sourceProject.get(asset.source_id) ?? '',
  })).filter(asset => asset.project_id)
  const homeHref = canAccessWorkspace(landing.persona, 'dashboard', landing.organizationRole) ? '/dashboard' : '/home'

  return <main className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm">
        <Link href={homeHref} className="flex items-center gap-3 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5" /></span>
          DataNexus AI
        </Link>
        <Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link>
      </nav>
      <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><BookMarked className="h-6 w-6" /></span>
          <div>
            <h1 className="text-3xl font-black">Business Glossary</h1>
            <p className="mt-1 text-sm text-slate-500">Reference vocabulary is separated from steward-approved business meaning. Published semantics are versioned and mappings remain evidence-bound.</p>
          </div>
        </div>
      </header>
      <GlossaryManager
        projects={orderedProjects}
        datasets={datasets.data ?? []}
        catalogAssets={catalogAssets}
        initialTerms={terms.data ?? []}
        manageableProjectIds={manageableProjectIds}
      />
    </div>
  </main>
}
