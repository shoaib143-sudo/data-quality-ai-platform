import Link from 'next/link'
import { Handshake } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/auth/require-user'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { resolvePreferredGovernanceProject } from '@/lib/governance/preferred-project'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { createClient } from '@/lib/supabase/server'
import { StewardshipManager } from './stewardship-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'

export default async function StewardshipPage() {
  const user = await requireUser()
  const [supabase, preferredProjectId, landing] = await Promise.all([
    createClient(),
    resolvePreferredGovernanceProject(user.id),
    resolveLandingAccess(user.id),
  ])
  const [projects, datasets, sources, assets, members, assignments, certifications, datasetCoverage, catalogCoverage] = await Promise.all([
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('discovered_assets').select('id,source_id,identity_key,asset_key,namespace,name,asset_type').eq('is_current', true).order('asset_key'),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
    supabase.schema('governance').from('stewardship_assignments').select('*').order('created_at', { ascending: false }),
    supabase.schema('governance').from('certification_requests').select('*').order('requested_at', { ascending: false }),
    supabase.schema('governance').from('stewardship_dataset_coverage').select('*').order('name'),
    supabase.schema('governance').from('stewardship_catalog_coverage').select('*').order('target_name'),
  ])
  for (const result of [projects, datasets, sources, assets, members, assignments, certifications, datasetCoverage, catalogCoverage]) {
    if (result.error) throw new Error(result.error.message)
  }

  const projectRows = projects.data ?? []
  const capabilities = await Promise.all(projectRows.map(async project => ({
    projectId: project.id,
    stewardshipManage: await hasProjectCapability(user.id, project.id, 'stewardship.manage'),
    certificationRequest: await hasProjectCapability(user.id, project.id, 'certification.request'),
    certificationReview: await hasProjectCapability(user.id, project.id, 'certification.review'),
  })))
  const stewardshipManageProjectIds = capabilities.filter(row => row.stewardshipManage).map(row => row.projectId)
  const certificationRequestProjectIds = capabilities.filter(row => row.certificationRequest).map(row => row.projectId)
  const certificationReviewProjectIds = capabilities.filter(row => row.certificationReview).map(row => row.projectId)

  const orderedProjects = [...projectRows].sort((left, right) => {
    if (left.id === preferredProjectId) return -1
    if (right.id === preferredProjectId) return 1
    return left.name.localeCompare(right.name)
  })
  const initialProjectId = preferredProjectId && orderedProjects.some(project => project.id === preferredProjectId)
    ? preferredProjectId
    : orderedProjects[0]?.id ?? null
  const canCatalog = canAccessWorkspace(landing.persona, 'catalog', landing.organizationRole)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Stewardship" contextLabel="Ownership and accountability" homeHref="/home" />
        <nav className="mb-6 mt-4 flex items-center justify-end rounded-2xl border bg-white px-5 py-3 shadow-sm">
          {canCatalog ? <Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link> : null}
        </nav>
        <header className="rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Handshake className="h-6 w-6" /></span>
            <div>
              <h1 className="text-3xl font-black">Ownership &amp; Stewardship</h1>
              <p className="mt-1 text-sm text-slate-500">Govern accountable roles against datasets or stable catalog identities. Source-native owner metadata remains source evidence and is never overwritten.</p>
            </div>
          </div>
        </header>
        <StewardshipManager
          projects={orderedProjects}
          datasets={datasets.data ?? []}
          sources={sources.data ?? []}
          catalogAssets={assets.data ?? []}
          members={members.data ?? []}
          initialAssignments={assignments.data ?? []}
          initialCertifications={certifications.data ?? []}
          datasetCoverage={datasetCoverage.data ?? []}
          catalogCoverage={catalogCoverage.data ?? []}
          initialProjectId={initialProjectId}
          stewardshipManageProjectIds={stewardshipManageProjectIds}
          certificationRequestProjectIds={certificationRequestProjectIds}
          certificationReviewProjectIds={certificationReviewProjectIds}
        />
      </div>
    </main>
  )
}