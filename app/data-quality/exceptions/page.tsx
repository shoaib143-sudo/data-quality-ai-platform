import Link from 'next/link'
import { ShieldAlert, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ExceptionsManager } from './exceptions-manager'

export default async function QualityExceptionsPage(){
  await requireUser()
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
  const {data:datasets,error:datasetsError}=datasetIds.length?await supabase.schema('catalog').from('datasets').select('id,name').in('id',datasetIds):{data:[],error:null}
  if(datasetsError)throw new Error(`Unable to load exception datasets: ${datasetsError.message}`)
  const ruleById=new Map((rules??[]).map(rule=>[rule.id,rule]))
  const versionById=new Map((versions??[]).map(version=>[version.id,version]))
  const datasetById=new Map((datasets??[]).map(dataset=>[dataset.id,dataset.name]))
  const rows=(exceptions??[]).map(item=>({...item,rule_name:ruleById.get(item.rule_definition_id)?.name??'Data quality rule',dataset_name:datasetById.get(versionById.get(item.dataset_version_id)?.dataset_id??'')??'Dataset'}))
  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-red-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/data-quality" className="font-semibold text-blue-600">Data Quality</Link><Link href="/data-quality/rules" className="font-semibold text-blue-600">Rules</Link></div></nav><header className="rounded-3xl border border-red-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldAlert className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Data Quality Exceptions</h1><p className="mt-1 text-sm text-slate-500">Review row-level failures, approve time-bounded waivers, resolve remediation and control quarantine release.</p></div></div></header><ExceptionsManager exceptions={rows}/></div></main>
}
