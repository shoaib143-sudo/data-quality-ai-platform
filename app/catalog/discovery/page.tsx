import Link from 'next/link'
import { Radar, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { DiscoveryManager } from './discovery-manager'

export default async function DiscoveryPage(){
  await requireUser()
  const supabase=await createClient()
  const [sources,runs]=await Promise.all([
    supabase.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').in('status',['ACTIVE','CONFIGURED']).order('name'),
    supabase.schema('catalog').from('discovery_runs').select('id,project_id,source_id,status,assets_discovered,error_message,started_at,completed_at').order('started_at',{ascending:false}).limit(200),
  ])
  if(sources.error)throw new Error(`Unable to load discovery sources: ${sources.error.message}`)
  if(runs.error)throw new Error(`Unable to load discovery history: ${runs.error.message}`)
  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link></nav><header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Radar className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Metadata Discovery</h1><p className="mt-1 text-sm text-slate-500">Scan governed sources for schemas, tables, files, columns and metadata through the durable worker.</p></div></div></header><DiscoveryManager sources={sources.data??[]} runs={runs.data??[]}/></div></main>
}
