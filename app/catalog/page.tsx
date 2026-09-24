import Link from 'next/link'
import { ArrowRight, BookOpen, Database, Layers3, PencilLine, Search } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { CatalogManager } from './catalog-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'

export default async function CatalogPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const user=await requireUser();const params=await searchParams;const supabase=await createClient();const landing=await resolveLandingAccess(user.id)
  const [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult]=await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,description,source_identifier,business_domain,status,owner_user_id,created_at,updated_at').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status,row_count,column_count,schema_hash,observed_at,created_at').order('version_number',{ascending:false}),
    supabase.schema('governance').from('dataset_catalog').select('*'),
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
  ])
  for(const result of [datasetsResult,versionsResult,catalogResult,projectsResult,membersResult])if(result.error)throw new Error(result.error.message)
  const projectIds=(projectsResult.data??[]).map(project=>String(project.id))
  const capabilityRows=await Promise.all(projectIds.map(async projectId=>[projectId,await hasProjectCapability(user.id,projectId,'catalog.update'),await hasProjectCapability(user.id,projectId,'discovery.execute')] as const))
  const editableProjectIds=capabilityRows.filter(([,editable])=>editable).map(([projectId])=>projectId)
  const canDiscover=canAccessWorkspace(landing.persona,'discovery',landing.organizationRole)&&capabilityRows.some(([, ,discover])=>discover)
  const canGlossary=canAccessWorkspace(landing.persona,'glossary',landing.organizationRole)
  const datasetCount=(datasetsResult.data??[]).length
  const versionCount=(versionsResult.data??[]).length
  const projectCount=(projectsResult.data??[]).length
  const initialQuery=(params.q??'').trim().slice(0,120)

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100"><div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Data Catalog" contextLabel="Governed assets and metadata" homeHref="/home" />

    <header className="relative mt-4 overflow-hidden rounded-[26px] border border-cyan-300/12 bg-[#09192d] p-6 shadow-[0_20px_60px_rgba(0,0,0,.24)] sm:p-7">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.08] blur-3xl"/>
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-300"><BookOpen className="h-5 w-5" aria-hidden="true"/></span>
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Governed data discovery</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white">Find the right governed data faster.</h1></div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">Search governed assets, understand their business context, and maintain metadata only where your project capability permits it.</p>
          {initialQuery?<div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2 text-xs text-cyan-100"><Search className="h-3.5 w-3.5" aria-hidden="true"/>Showing catalog results for <strong>“{initialQuery}”</strong></div>:null}
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto xl:min-w-[480px]">
          <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><Database className="h-4 w-4 text-cyan-300" aria-hidden="true"/><p className="mt-3 text-2xl font-black text-white">{datasetCount}</p><p className="text-[11px] text-slate-500">Governed datasets</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><Layers3 className="h-4 w-4 text-violet-300" aria-hidden="true"/><p className="mt-3 text-2xl font-black text-white">{versionCount}</p><p className="text-[11px] text-slate-500">Observed versions</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><PencilLine className="h-4 w-4 text-emerald-300" aria-hidden="true"/><p className="mt-3 text-2xl font-black text-white">{editableProjectIds.length}/{projectCount}</p><p className="text-[11px] text-slate-500">Projects editable</p></div>
        </div>
      </div>
    </header>

    <section aria-label="Catalog tasks" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {canDiscover?<Link href="/catalog/discovery" className="group flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#09192d] p-4 hover:border-cyan-300/25 hover:bg-[#0b2038]"><span><span className="block text-sm font-black text-slate-100">Discovery</span><span className="mt-1 block text-xs text-slate-500">Scan approved sources and bring observed metadata into governance.</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-cyan-300" aria-hidden="true"/></Link>:null}
      <Link href="/catalog/physical-assets" className="group flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#09192d] p-4 hover:border-cyan-300/25 hover:bg-[#0b2038]"><span><span className="block text-sm font-black text-slate-100">Physical Assets</span><span className="mt-1 block text-xs text-slate-500">Inspect discovered tables, views and physical metadata.</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-cyan-300" aria-hidden="true"/></Link>
      {canGlossary?<Link href="/glossary" className="group flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#09192d] p-4 hover:border-cyan-300/25 hover:bg-[#0b2038]"><span><span className="block text-sm font-black text-slate-100">Glossary</span><span className="mt-1 block text-xs text-slate-500">Map technical assets to approved glossary terms and context.</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-cyan-300" aria-hidden="true"/></Link>:null}
    </section>

    <CatalogManager datasets={datasetsResult.data??[]} versions={versionsResult.data??[]} catalog={catalogResult.data??[]} projects={projectsResult.data??[]} members={membersResult.data??[]} editableProjectIds={editableProjectIds} initialQuery={initialQuery}/>
  </div></main>
}