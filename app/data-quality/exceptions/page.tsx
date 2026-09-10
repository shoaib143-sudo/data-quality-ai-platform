import Link from 'next/link'
import { Layers3, ShieldAlert } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ExceptionsManager } from './exceptions-manager'

export default async function QualityExceptionsPage(){
  const user=await requireUser()
  const supabase=await createClient()
  const {data:exceptions,error:exceptionsError}=await supabase.schema('profiling').from('quality_rule_exceptions').select('*').order('created_at',{ascending:false}).limit(500)
  if(exceptionsError)throw new Error(`Unable to load quality exceptions: ${exceptionsError.message}`)
  const ruleIds=[...new Set((exceptions??[]).map(item=>item.rule_definition_id))]
  const versionIds=[...new Set((exceptions??[]).map(item=>item.dataset_version_id))]
  const [{data:rules,error:rulesError},{data:versions,error:versionsError}]=await Promise.all([
    ruleIds.length?supabase.schema('profiling').from('quality_rule_definitions').select('id,name,dataset_id').in('id',ruleIds):Promise.resolve({data:[],error:null}),
    versionIds.length?supabase.schema('catalog').from('dataset_versions').select('id,dataset_id').in('id',versionIds):Promise.resolve({data:[],error:null}),
  ])
  if(rulesError)throw new Error(`Unable to load exception rules: ${rulesError.message}`)
  if(versionsError)throw new Error(`Unable to load exception dataset versions: ${versionsError.message}`)
  const datasetIds=[...new Set((versions??[]).map(version=>version.dataset_id))]
  const {data:datasets,error:datasetsError}=datasetIds.length?await supabase.schema('catalog').from('datasets').select('id,name,project_id').in('id',datasetIds):{data:[],error:null}
  if(datasetsError)throw new Error(`Unable to load exception datasets: ${datasetsError.message}`)
  const projectIds=[...new Set((datasets??[]).map(dataset=>String(dataset.project_id)))]
  const approvableProjectIds=(await Promise.all(projectIds.map(async projectId=>[projectId,await hasProjectCapability(user.id,projectId,'quality.exception.approve')] as const))).filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const ruleById=new Map((rules??[]).map(rule=>[rule.id,rule]))
  const versionById=new Map((versions??[]).map(version=>[version.id,version]))
  const datasetById=new Map((datasets??[]).map(dataset=>[dataset.id,dataset]))
  const rows=(exceptions??[]).map(item=>{const dataset=datasetById.get(versionById.get(item.dataset_version_id)?.dataset_id??'');return {...item,project_id:String(dataset?.project_id??''),rule_name:ruleById.get(item.rule_definition_id)?.name??'Data quality rule',dataset_name:dataset?.name??'Dataset'}})
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex gap-2 text-sm"><Link href="/data-quality" className="font-semibold text-blue-300">Data Quality</Link><Link href="/data-quality/rules" className="font-semibold text-blue-300">Rules</Link></div></nav><header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-400/10 text-rose-300"><ShieldAlert className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Data Quality Exceptions</h1><p className="mt-1 text-sm text-slate-400">Review row-level failures and waiver history. Approval and release actions appear only where <code>quality.exception.approve</code> is granted.</p></div></div></header><ExceptionsManager exceptions={rows} approvableProjectIds={approvableProjectIds}/></div></main>
}