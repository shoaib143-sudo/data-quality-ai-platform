import Link from 'next/link'
import { GitBranch, Network, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ImpactManager } from './impact-manager'
import { ChangeImpactManager } from './change-impact-manager'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}

export default async function LineageImpactPage(){
  await requireUser()
  const supabase=await createClient()
  const {data:projects,error:projectError}=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(projectError)throw new Error(`Unable to load projects: ${projectError.message}`)
  const projectIds=(projects??[]).map(project=>project.id)
  const {data:datasets,error:datasetError}=projectIds.length
    ?await supabase.schema('catalog').from('datasets').select('id,project_id,name').in('project_id',projectIds).order('name')
    :{data:[],error:null}
  if(datasetError)throw new Error(`Unable to load datasets: ${datasetError.message}`)
  const projectRows=(projects??[]) as Project[]
  const datasetRows=(datasets??[]) as Dataset[]

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/lineage" className="font-bold text-blue-700">← Lineage</Link><div className="flex gap-2"><Link href="/observability/incidents" className="rounded-xl border px-3 py-2 text-sm font-semibold">AI Operations Center</Link><Link href="/lineage/ingest" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Lineage ingestion</Link></div></nav>
    <section className="mt-6 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"><Network className="h-4 w-4"/>Lineage Impact Intelligence</div><h1 className="mt-4 text-3xl font-black">Blast radius, business exposure and confidence from persisted lineage evidence</h1><p className="mt-3 max-w-4xl text-slate-600">Analyze downstream or upstream dependencies across governed and externally discovered assets. Risk combines incident severity, path distance, dataset criticality and certification evidence while confidence reflects lineage provenance and transformation evidence.</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><GitBranch className="h-3.5 w-3.5"/>Cycle-safe multi-hop traversal</span><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5"/>Auditable deterministic scoring</span></div></section>
    <ImpactManager projects={projectRows} datasets={datasetRows}/>
    <ChangeImpactManager projects={projectRows} datasets={datasetRows}/>
  </div></main>
}
