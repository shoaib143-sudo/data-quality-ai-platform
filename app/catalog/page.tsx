import Link from 'next/link'
import { BookOpen, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { CatalogManager } from './catalog-manager'

export default async function CatalogPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  await requireUser();const params=await searchParams;const supabase=await createClient()
  const [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult]=await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,description,source_identifier,business_domain,status,owner_user_id,created_at,updated_at').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status,row_count,column_count,schema_hash,observed_at,created_at').order('version_number',{ascending:false}),
    supabase.schema('governance').from('dataset_catalog').select('*'),
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
  ])
  for(const result of [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult])if(result.error)throw new Error(result.error.message)
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex flex-wrap gap-2 text-sm"><Link href="/catalog/discovery" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Discovery</Link><Link href="/catalog/physical-assets" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Physical Assets</Link><Link href="/glossary" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Glossary</Link></div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><BookOpen className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Data Catalog</h1><p className="mt-1 text-sm text-slate-400">Search governed assets, open the object itself, and maintain ownership, certification, lifecycle, criticality, tags and business metadata.</p></div></div></header>
    <CatalogManager datasets={datasetsResult.data??[]} versions={versionsResult.data??[]} catalog={catalogResult.data??[]} projects={projectsResult.data??[]} members={membersResult.data??[]} initialQuery={(params.q??'').trim().slice(0,120)}/>
  </div></main>
}
