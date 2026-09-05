import Link from 'next/link'
import { Database, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { PhysicalAssetManager } from './physical-asset-manager'

export default async function PhysicalAssetsPage() {
  await requireUser()
  const supabase = await createClient()
  const [assetsResult, trustResult, requestsResult, sourcesResult] = await Promise.all([
    supabase.schema('catalog').from('current_catalog_source_assets').select('id,source_id,identity_key,asset_key,asset_type,namespace,name,version_number,last_seen_at,metadata').order('asset_key'),
    supabase.schema('catalog').from('current_asset_trust').select('project_id,source_id,identity_key,asset_key,presence_state,last_seen_at,trust_score,dimensions,explanation,certification_state'),
    supabase.schema('catalog').from('asset_promotion_requests').select('id,project_id,source_id,identity_key,status,recommendation_source,confidence,rationale,requested_at,decided_at,decision_reason,dataset_id,updated_at').order('updated_at', { ascending: false }),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').order('name'),
  ])
  for (const result of [assetsResult, trustResult, requestsResult, sourcesResult]) if (result.error) throw new Error(result.error.message)

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Catalog</Link><Link href="/catalog/discovery" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Discovery</Link></div></nav>
    <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Database className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Physical Metadata Assets</h1><p className="mt-1 text-sm text-slate-500">Published source facts, explainable trust evidence, and human-governed promotion into the business catalog.</p></div></div></header>
    <PhysicalAssetManager assets={assetsResult.data ?? []} trust={trustResult.data ?? []} requests={requestsResult.data ?? []} sources={sourcesResult.data ?? []}/>
  </div></main>
}
