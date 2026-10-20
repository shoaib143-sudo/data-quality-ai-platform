import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { DiscoveryRunHistory } from '@/components/catalog/discovery-run-history'

export default async function DiscoveryHistoryPage(){
  const user=await requireUser()
  const [supabase,landing]=await Promise.all([createClient(),resolveLandingAccess(user.id)])
  const [runsResult,sourcesResult,changesResult]=await Promise.all([
    supabase.schema('catalog').from('discovery_runs').select('id,source_id,status,error_message,observed_from,observed_to,completed_at,objects_observed,objects_added,objects_changed,objects_missing,objects_removed,objects_unchanged,consistency_mode,schema_snapshot').order('observed_from',{ascending:false}).limit(250),
    supabase.schema('catalog').from('data_sources').select('id,name,source_type,status').order('name'),
    supabase.schema('catalog').from('catalog_revision_changes').select('revision_id,source_id,revision_number,published_at,asset_key,change_type,details').order('published_at',{ascending:false}).limit(500),
  ])
  if(runsResult.error)throw new Error(runsResult.error.message)
  if(sourcesResult.error)throw new Error(sourcesResult.error.message)
  if(changesResult.error)throw new Error(changesResult.error.message)
  return <main id="main-content" tabIndex={-1} className="dn-light-workspace min-h-screen bg-[#0b1422] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Discovery Diagnostics" contextLabel="Metadata scan runs and failure evidence" homeHref="/home"/><nav className="mb-6 mt-4 flex flex-wrap justify-end gap-2 rounded-2xl border border-white/10 bg-[#102036] p-3"><Link href="/catalog/discovery" className="rounded-xl px-3 py-2 text-sm font-bold text-blue-300 hover:bg-white/[0.05]">Discovery</Link><Link href="/catalog" className="rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.05]">Catalog</Link></nav><header className="mb-5 rounded-3xl border border-white/10 bg-[#102036] p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Scan operations</p><h1 className="mt-2 text-3xl font-black">Metadata scan history and diagnostics</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">Inspect complete, incomplete and failed discovery runs with changed-object evidence, manifest completeness and safe source rescan controls.</p></header><DiscoveryRunHistory runs={runsResult.data??[]} sources={sourcesResult.data??[]} changes={changesResult.data??[]}/></div></main>
}
