import Link from 'next/link'
import { Handshake, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'
import { StewardshipManager } from './stewardship-manager'

export default async function StewardshipPage() {
  await requireUser()
  const supabase = await createClient()
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

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm">
          <Link href="/dashboard" className="flex items-center gap-3 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5" /></span>
            Data Governance PowerHouse
          </Link>
          <Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link>
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
          projects={projects.data ?? []}
          datasets={datasets.data ?? []}
          sources={sources.data ?? []}
          catalogAssets={assets.data ?? []}
          members={members.data ?? []}
          initialAssignments={assignments.data ?? []}
          initialCertifications={certifications.data ?? []}
          datasetCoverage={datasetCoverage.data ?? []}
          catalogCoverage={catalogCoverage.data ?? []}
        />
      </div>
    </main>
  )
}
