import Link from 'next/link'
import { ShieldCheck, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'
import { ClassificationPrivacyManager } from './classification-privacy-manager'

export default async function ClassificationPrivacyPage() {
  await requireUser()
  const supabase = await createClient()
  const [projects, datasets, sources, assets, labels, classifications, datasetCoverage, catalogCoverage, hooks] = await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('discovered_assets').select('id,source_id,identity_key,asset_key,namespace,name,asset_type,columns').eq('is_current', true).order('asset_key'),
    supabase.schema('governance').from('classification_labels').select('id,project_id,code,name,category,sensitivity_level,privacy_category,handling_requirements,enabled').eq('enabled', true).order('code'),
    supabase.schema('governance').from('dataset_classifications').select('id,project_id,dataset_id,column_name,label_id,status,confidence,source,target_type,data_source_id,catalog_identity_key,target_locator,target_state,origin,authority_state,reviewed_at,review_comment').order('created_at', { ascending: false }),
    supabase.schema('governance').from('classification_dataset_coverage').select('*').order('name'),
    supabase.schema('governance').from('classification_catalog_coverage').select('*').order('asset_key'),
    supabase.schema('governance').from('privacy_control_hooks').select('*').order('target_locator'),
  ])
  for (const result of [projects, datasets, sources, assets, labels, classifications, datasetCoverage, catalogCoverage, hooks]) {
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
        <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-3xl font-black">Classification &amp; Privacy</h1>
              <p className="mt-1 text-sm text-slate-500">Separate source observations and AI suggestions from human-approved governance authority. Catalog targets follow stable provider identity; field names remain validated locators.</p>
            </div>
          </div>
        </header>
        <ClassificationPrivacyManager
          projects={projects.data ?? []}
          datasets={datasets.data ?? []}
          sources={sources.data ?? []}
          assets={assets.data ?? []}
          labels={labels.data ?? []}
          classifications={classifications.data ?? []}
          datasetCoverage={datasetCoverage.data ?? []}
          catalogCoverage={catalogCoverage.data ?? []}
          privacyHooks={hooks.data ?? []}
        />
      </div>
    </main>
  )
}
