'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, Save, Loader2, ArrowRight } from 'lucide-react'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'

type Dataset={id:string;project_id:string;name:string;description:string|null;source_identifier:string|null;business_domain:string|null;status:string;owner_user_id:string|null}
type Version={id:string;dataset_id:string;version_number:number;status:string;row_count:number|null;column_count:number|null;schema_hash:string|null;observed_at:string|null;created_at:string}
type Catalog={dataset_id:string;project_id:string;technical_owner_user_id:string|null;business_owner_user_id:string|null;steward_user_id:string|null;lifecycle_status:string;certification_status:string;criticality:string;tags:string[];business_description:string|null;retention_days:number|null}
type Project={id:string;name:string;organization_id:string}
type Member={organization_id:string;user_id:string;role:string}

export function CatalogManager({datasets,versions,catalog:initialCatalog,projects,members,editableProjectIds,initialQuery=''}:{datasets:Dataset[];versions:Version[];catalog:Catalog[];projects:Project[];members:Member[];editableProjectIds:string[];initialQuery?:string}){
  const [query,setQuery]=useState(initialQuery)
  const [catalog,setCatalog]=useState(initialCatalog)
  const [editing,setEditing]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const editableProjects=useMemo(()=>new Set(editableProjectIds),[editableProjectIds])
  const catalogByDataset=useMemo(()=>new Map(catalog.map(item=>[item.dataset_id,item])),[catalog])
  const latestVersion=useMemo(()=>{const map=new Map<string,Version>();for(const v of versions)if(!map.has(v.dataset_id))map.set(v.dataset_id,v);return map},[versions])
  const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects])
  const filtered=datasets.filter(d=>{const c=catalogByDataset.get(d.id);const hay=[d.name,d.description,d.source_identifier,d.business_domain,c?.business_description,c?.certification_status,c?.criticality,(c?.tags??[]).join(' ')].join(' ').toLowerCase();return hay.includes(query.toLowerCase())})

  async function save(dataset:Dataset,form:HTMLFormElement){
    if(!editableProjects.has(dataset.project_id)){setMessage('You do not have permission to update governance metadata for this project.');return}
    setBusy(true);setMessage('')
    try{
      const fd=new FormData(form)
      const body={
        businessDescription:String(fd.get('businessDescription')??''),
        lifecycleStatus:String(fd.get('lifecycleStatus')??'ACTIVE'),
        criticality:String(fd.get('criticality')??'MEDIUM'),
        technicalOwnerUserId:String(fd.get('technicalOwnerUserId')??'')||null,
        businessOwnerUserId:String(fd.get('businessOwnerUserId')??'')||null,
        stewardUserId:String(fd.get('stewardUserId')??'')||null,
        retentionDays:Number(fd.get('retentionDays')??0)||null,
        tags:String(fd.get('tags')??'').split(',').map(v=>v.trim()).filter(Boolean),
      }
      const response=await fetch(`/api/catalog/${dataset.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const payload=await response.json()
      if(!response.ok)throw new Error(payload.error??'Unable to update catalog metadata.')
      setCatalog(current=>[...current.filter(item=>item.dataset_id!==dataset.id),payload.catalog])
      setEditing(null);setMessage('Catalog metadata saved.')
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to update catalog metadata.')}finally{setBusy(false)}
  }

  return <section className="mt-6 rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Governed assets</h2><p className="mt-1 text-sm text-slate-400">{datasets.length} registered datasets · {filtered.length} shown</p></div><label className="relative min-w-[280px]"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, domain, tag, source…" className="w-full rounded-xl border border-white/10 bg-[#08182b] py-2.5 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"/></label></div>
    {message?<p className="mt-3 text-sm text-slate-400">{message}</p>:null}
    <div className="mt-5 space-y-3">{filtered.map(dataset=>{
      const c=catalogByDataset.get(dataset.id);const v=latestVersion.get(dataset.id);const project=projectById.get(dataset.project_id);const orgMembers=members.filter(m=>m.organization_id===project?.organization_id);const canEdit=editableProjects.has(dataset.project_id);const detailHref=canonicalRoutes.governedDataset(dataset.id)
      return <article key={dataset.id} className="rounded-2xl border border-white/[0.08] bg-[#08182b] p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={detailHref} className="group inline-flex items-center gap-1 text-lg font-bold text-white hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{dataset.name}<ArrowRight className="h-4 w-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100"/></Link><span className="rounded-full bg-blue-400/10 px-2.5 py-1 text-xs font-bold text-blue-300">{c?.certification_status??'UNCERTIFIED'}</span><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-slate-400">{c?.lifecycle_status??'ACTIVE'}</span><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">{c?.criticality??'MEDIUM'} criticality</span></div><p className="mt-1 text-sm text-slate-400">{c?.business_description||dataset.description||'No business description.'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{project?.name??'Project'}</span><span>·</span><span>{dataset.business_domain??'Unassigned domain'}</span><span>·</span><span>{dataset.source_identifier??'No source identifier'}</span><span>·</span><span>v{v?.version_number??'—'} {v?.status??''}</span>{v?.row_count!=null?<><span>·</span><span>{v.row_count} rows</span></>:null}</div><div className="mt-3 flex flex-wrap gap-2">{(c?.tags??[]).map(tag=><button key={tag} type="button" onClick={()=>setQuery(tag)} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-cyan-400/30">#{tag}</button>)}</div></div><div className="flex flex-wrap gap-2"><Link href={detailHref} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:border-cyan-400/30">Open dataset</Link>{canEdit?<button type="button" onClick={()=>setEditing(editing===dataset.id?null:dataset.id)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:border-cyan-400/30">{editing===dataset.id?'Close':'Edit governance metadata'}</button>:null}</div></div>
      {editing===dataset.id&&canEdit?<form onSubmit={e=>{e.preventDefault();void save(dataset,e.currentTarget)}} className="mt-5 grid gap-3 rounded-2xl border border-white/[0.06] bg-[#061426] p-4 lg:grid-cols-2"><label className="text-xs font-bold text-slate-300">Business description<textarea name="businessDescription" defaultValue={c?.business_description??''} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-sm text-slate-200"/></label><label className="text-xs font-bold text-slate-300">Tags<input name="tags" defaultValue={(c?.tags??[]).join(', ')} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-sm text-slate-200" placeholder="customer, finance, gold"/></label><label className="text-xs font-bold text-slate-300">Lifecycle<select name="lifecycleStatus" defaultValue={c?.lifecycle_status??'ACTIVE'} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-slate-200"><option>ACTIVE</option><option>DEPRECATED</option><option>RETIRED</option></select></label><div className="text-xs font-bold text-slate-300">Certification<div className="mt-1 rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-sm font-medium text-slate-300">{c?.certification_status??'UNCERTIFIED'} <span className="font-normal text-slate-500">· managed through certification workflow</span></div></div><label className="text-xs font-bold text-slate-300">Criticality<select name="criticality" defaultValue={c?.criticality??'MEDIUM'} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-slate-200"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label className="text-xs font-bold text-slate-300">Retention days<input type="number" min="0" name="retentionDays" defaultValue={c?.retention_days??''} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-slate-200"/></label>{[['technicalOwnerUserId','Technical owner',c?.technical_owner_user_id],['businessOwnerUserId','Business owner',c?.business_owner_user_id],['stewardUserId','Data steward',c?.steward_user_id]].map(([name,label,value])=><label key={String(name)} className="text-xs font-bold text-slate-300">{label}<select name={String(name)} defaultValue={String(value??'')} className="mt-1 w-full rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-slate-200"><option value="">Unassigned</option>{orgMembers.map(member=><option key={member.user_id+member.role} value={member.user_id}>{member.user_id.slice(0,8)} · {member.role}</option>)}</select></label>)}<div className="lg:col-span-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save metadata</button></div></form>:null}
      </article>
    })}{filtered.length===0?<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-300"><p className="font-semibold">No governed data matches “{query}”.</p><button type="button" onClick={()=>setQuery('')} className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-400/30">Clear search</button></div>:null}</div>
  </section>
}
