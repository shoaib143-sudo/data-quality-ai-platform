import Link from 'next/link'
import { BookOpen, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { CatalogManager } from './catalog-manager'

export default async function CatalogPage(){
  await requireUser();const supabase=await createClient()
  const [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult]=await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,description,source_identifier,business_domain,status,owner_user_id,created_at,updated_at').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status,row_count,column_count,schema_hash,observed_at,created_at').order('version_number',{ascending:false}),
    supabase.schema('governance').from('dataset_catalog').select('*'),
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
  ])
  for(const result of [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult])if(result.error)throw new Error(result.error.message)
  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/glossary" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Glossary</Link><Link href="/stewardship" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Stewardship</Link><Link href="/lineage" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Lineage</Link></div></nav>
    <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><BookOpen className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Data Catalog</h1><p className="mt-1 text-sm text-slate-500">Search governed assets and maintain ownership, certification, lifecycle, criticality, tags and business metadata.</p></div></div></header>
    <CatalogManager datasets={datasetsResult.data??[]} versions={versionsResult.data??[]} catalog={catalogResult.data??[]} projects={projectsResult.data??[]} members={membersResult.data??[]}/>
  </div></main>
}
