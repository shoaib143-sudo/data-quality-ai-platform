import Link from 'next/link'
import { BookOpen } from 'lucide-react'
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
  const datasetIds=(datasetsResult.data??[]).map(dataset=>String(dataset.id))
  const emptyContext={data:[],error:null}
  const [lineageAssetsResult,issuesContextResult,contractsContextResult,alertsContextResult]=await Promise.all([
    datasetIds.length?supabase.schema('governance').from('lineage_assets').select('dataset_id').in('dataset_id',datasetIds):Promise.resolve(emptyContext),
    datasetIds.length?supabase.schema('governance').from('issues').select('dataset_id,status').in('dataset_id',datasetIds):Promise.resolve(emptyContext),
    datasetIds.length?supabase.schema('governance').from('data_contracts').select('dataset_id,status').in('dataset_id',datasetIds):Promise.resolve(emptyContext),
    datasetIds.length?supabase.schema('profiling').from('observability_alerts').select('dataset_id,status').in('dataset_id',datasetIds):Promise.resolve(emptyContext),
  ])
  for(const result of [lineageAssetsResult,issuesContextResult,contractsContextResult,alertsContextResult])if(result.error)throw new Error(result.error.message)
  const countByDataset=(rows:any[],predicate:(row:any)=>boolean=()=>true)=>rows.reduce<Record<string,number>>((counts,row)=>{if(row.dataset_id&&predicate(row))counts[row.dataset_id]=(counts[row.dataset_id]??0)+1;return counts},{})
  const lineageByDataset=countByDataset(lineageAssetsResult.data??[])
  const issuesByDataset=countByDataset(issuesContextResult.data??[],row=>!['RESOLVED','CLOSED','CANCELLED','REJECTED'].includes(String(row.status).toUpperCase()))
  const contractsByDataset=countByDataset(contractsContextResult.data??[],row=>!['RETIRED','CANCELLED'].includes(String(row.status).toUpperCase()))
  const alertsByDataset=countByDataset(alertsContextResult.data??[],row=>!['RESOLVED','CLOSED'].includes(String(row.status).toUpperCase()))
  const contextByDataset=Object.fromEntries(datasetIds.map(id=>[id,{lineageAssets:lineageByDataset[id]??0,openIssues:issuesByDataset[id]??0,dataContracts:contractsByDataset[id]??0,openAlerts:alertsByDataset[id]??0}]))
  const projectIds=(projectsResult.data??[]).map(project=>String(project.id))
  const capabilityRows=await Promise.all(projectIds.map(async projectId=>[projectId,await hasProjectCapability(user.id,projectId,'catalog.update'),await hasProjectCapability(user.id,projectId,'discovery.execute')] as const))
  const editableProjectIds=capabilityRows.filter(([,editable])=>editable).map(([projectId])=>projectId)
  const canDiscover=canAccessWorkspace(landing.persona,'discovery',landing.organizationRole)&&capabilityRows.some(([, ,discover])=>discover)
  const canGlossary=canAccessWorkspace(landing.persona,'glossary',landing.organizationRole)
  const canLineage=canAccessWorkspace(landing.persona,'lineage',landing.organizationRole)
  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Data Catalog" contextLabel="Governed assets and metadata" homeHref="/home" />
    <nav aria-label="Catalog tools" className="mb-6 mt-4 flex items-center justify-between gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#0a1d33] px-4 py-3 shadow-sm sm:px-5"><span className="shrink-0 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Catalog tools</span><div className="flex shrink-0 gap-2 text-sm"><Link href="/catalog" aria-current="page" className="rounded-xl bg-blue-600/20 px-3 py-2 font-semibold text-blue-200 ring-1 ring-blue-400/20">Browse</Link>{canDiscover?<Link href="/catalog/discovery" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Discovery</Link>:null}<Link href="/catalog/physical-assets" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Physical Assets</Link>{canGlossary?<Link href="/glossary" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Glossary</Link>:null}{canLineage?<Link href="/lineage" className="rounded-xl px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.05] hover:text-white">Lineage</Link>:null}</div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><BookOpen className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Data Catalog</h1><p className="mt-1 text-sm text-slate-400">Search governed assets, open the object itself, and maintain metadata only where your project capability permits it.</p></div></div></header>
    <CatalogManager datasets={datasetsResult.data??[]} versions={versionsResult.data??[]} catalog={catalogResult.data??[]} projects={projectsResult.data??[]} members={membersResult.data??[]} editableProjectIds={editableProjectIds} contextByDataset={contextByDataset} initialQuery={(params.q??'').trim().slice(0,120)}/>
  </div></main>
}