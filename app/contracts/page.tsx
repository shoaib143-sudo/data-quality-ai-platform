import Link from 'next/link'
import { FileCheck2, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ContractManager } from './contract-manager'

export default async function ContractsPage(){
  await requireUser()
  const supabase=await createClient()
  const [projectsResult,datasetsResult,versionsResult,contractsResult,contractVersionsResult]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').order('version_number',{ascending:false}),
    supabase.schema('governance').from('data_contracts').select('id,project_id,dataset_id,name,status,current_version').order('updated_at',{ascending:false}),
    supabase.schema('governance').from('data_contract_versions').select('id,contract_id,version_number,schema_hash,compatibility_policy,freshness_sla_hours,row_count_min,row_count_max,quality_requirements,critical_columns,status,change_reason,effective_at,created_at').order('version_number',{ascending:false}),
  ])
  for(const result of [projectsResult,datasetsResult,versionsResult,contractsResult,contractVersionsResult])if(result.error)throw new Error(result.error.message)

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
  for(const run of runs??[]){
    const datasetId=versionById.get(run.dataset_version_id)?.dataset_id
    if(!datasetId||seen.has(datasetId))continue
    seen.add(datasetId)
    profiles.push({id:run.id,dataset_id:datasetId,schema_hash:run.schema_hash,row_count:run.row_count,overall_score:scoreByRun.get(run.id)??null})
  }

  return <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.9),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold hover:bg-blue-50">Catalog</Link><Link href="/observability/settings" className="rounded-xl px-3 py-2 font-semibold hover:bg-blue-50">Observability policies</Link></div></nav>
    <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><FileCheck2 className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Data Contracts</h1><p className="mt-1 text-sm text-slate-500">Versioned, enforceable expectations for schema, freshness, volume, critical columns and quality.</p></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Active contracts are evaluated automatically whenever profiling completes. Material failures create observability alerts and invalidate dataset certification until the contract is satisfied again.</p></header>
    <ContractManager projects={projectsResult.data??[]} datasets={datasetsResult.data??[]} contracts={contractsResult.data??[]} versions={contractVersionsResult.data??[]} profiles={profiles}/>
  </div></main>
}
