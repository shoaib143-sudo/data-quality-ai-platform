import Link from 'next/link'
import { FileCheck2, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { ContractManagerV2 } from './contract-manager-v2'

export default async function ContractsPage(){
  const user=await requireUser()
  const supabase=await createClient()
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

  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Catalog</Link><Link href="/profiling/explorer" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Profiling evidence</Link><Link href="/issues" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05] hover:text-white">Issues</Link></div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><FileCheck2 className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governed expectations</p><h1 className="mt-1 text-3xl font-black text-white">Data Contracts</h1><p className="mt-1 text-sm text-slate-400">Versioned expectations for schema, freshness, volume, critical columns and quality. Write and activation controls appear only when the selected project grants the corresponding capability.</p></div></div></header>
    <ContractManagerV2 projects={projects} datasets={datasetsResult.data??[]} contracts={contractsResult.data??[]} versions={contractVersionsResult.data??[]} profiles={profiles}/>
  </div></main>
}
