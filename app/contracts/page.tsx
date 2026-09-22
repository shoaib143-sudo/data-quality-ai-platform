import Link from 'next/link'
import { FileCheck2 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { ContractManagerV2 } from './contract-manager-v2'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function ContractsPage(){
  const user=await requireUser()
  const [supabase,landing]=await Promise.all([createClient(),resolveLandingAccess(user.id)])
  const canCatalog=canAccessWorkspaceHref(landing.persona,'/catalog',landing.organizationRole)
  const canProfiling=canAccessWorkspaceHref(landing.persona,'/profiling/explorer',landing.organizationRole)
  const canIssues=canAccessWorkspaceHref(landing.persona,'/issues',landing.organizationRole)
  const [projectsResult,datasetsResult,versionsResult,contractsResult,contractVersionsResult]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').order('version_number',{ascending:false}),
    supabase.schema('governance').from('data_contracts').select('id,project_id,dataset_id,name,status,current_version').order('updated_at',{ascending:false}),
    supabase.schema('governance').from('data_contract_versions').select('id,contract_id,version_number,schema_hash,compatibility_policy,freshness_sla_hours,row_count_min,row_count_max,quality_requirements,critical_columns,status,change_reason,effective_at,created_at').order('version_number',{ascending:false}),
  ])
  for(const result of [projectsResult,datasetsResult,versionsResult,contractsResult,contractVersionsResult])if(result.error)throw new Error(result.error.message)

  const projects=await Promise.all((projectsResult.data??[]).map(async project=>({
    ...project,
    canManageContract:await hasProjectCapability(user.id,project.id,'contract.manage'),
    canApproveContract:await hasProjectCapability(user.id,project.id,'contract.approve'),
  })))
  const versions=versionsResult.data??[]
  const versionIds=versions.map(version=>version.id)
  const {data:runs,error:runsError}=versionIds.length?await supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,schema_hash,row_count,started_at').in('dataset_version_id',versionIds).eq('status','COMPLETED').order('started_at',{ascending:false}):{data:[],error:null}
  if(runsError)throw new Error(`Unable to load contract profiling baselines: ${runsError.message}`)
  const runIds=(runs??[]).map(run=>run.id)
  const {data:scores,error:scoresError}=runIds.length?await supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').in('profile_run_id',runIds):{data:[],error:null}
  if(scoresError)throw new Error(`Unable to load contract quality baselines: ${scoresError.message}`)

  const versionById=new Map(versions.map(version=>[version.id,version]))
  const scoreByRun=new Map((scores??[]).map(score=>[score.profile_run_id,score.overall_score]))
  const profiles:Array<{id:string;dataset_id:string;schema_hash:string|null;row_count:number|null;overall_score:number|null}>=[]
  const seen=new Set<string>()
  for(const run of runs??[]){const datasetId=versionById.get(run.dataset_version_id)?.dataset_id;if(!datasetId||seen.has(datasetId))continue;seen.add(datasetId);profiles.push({id:run.id,dataset_id:datasetId,schema_hash:run.schema_hash,row_count:run.row_count,overall_score:scoreByRun.get(run.id)??null})}

  return <main id="main-content" tabIndex={-1} className="min-h-screen text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Data Contracts" contextLabel="Versioned governed expectations" homeHref="/home" /><div className="dn-glass-rail sticky top-[4.5rem] z-30 mb-3 mt-3 flex flex-wrap justify-end gap-1 rounded-2xl p-2 text-sm">{canCatalog?<Link href="/catalog" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Catalog</Link>:null}{canProfiling?<Link href="/profiling/explorer" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Profiling evidence</Link>:null}{canIssues?<Link href="/issues" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Issues</Link>:null}</div>
    <header className="dn-surface p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-300/[0.08] text-sky-200"><FileCheck2 className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governed expectations</p><h1 className="mt-1 text-3xl font-black text-white">Data Contracts</h1><p className="mt-1 text-sm text-slate-400">Versioned expectations for schema, freshness, volume, critical columns and quality. Write and activation controls appear only when the selected project grants the corresponding capability.</p></div></div></header>
    <ContractManagerV2 projects={projects} datasets={datasetsResult.data??[]} contracts={contractsResult.data??[]} versions={contractVersionsResult.data??[]} profiles={profiles}/>
  </div></main>
}