'use client'
import { useMemo, useState } from 'react'
import { Search, Save, Loader2 } from 'lucide-react'

type Dataset={id:string;project_id:string;name:string;description:string|null;source_identifier:string|null;business_domain:string|null;status:string;owner_user_id:string|null}
type Version={id:string;dataset_id:string;version_number:number;status:string;row_count:number|null;column_count:number|null;schema_hash:string|null;observed_at:string|null;created_at:string}
type Catalog={dataset_id:string;project_id:string;technical_owner_user_id:string|null;business_owner_user_id:string|null;steward_user_id:string|null;lifecycle_status:string;certification_status:string;criticality:string;tags:string[];business_description:string|null;retention_days:number|null}
type Project={id:string;name:string;organization_id:string}
type Member={organization_id:string;user_id:string;role:string}

export function CatalogManager({datasets,versions,catalog:initialCatalog,projects,members}:{datasets:Dataset[];versions:Version[];catalog:Catalog[];projects:Project[];members:Member[]}){
  const [query,setQuery]=useState('')
  const [catalog,setCatalog]=useState(initialCatalog)
  const [editing,setEditing]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const catalogByDataset=useMemo(()=>new Map(catalog.map(item=>[item.dataset_id,item])),[catalog])
  const latestVersion=useMemo(()=>{const map=new Map<string,Version>();for(const v of versions)if(!map.has(v.dataset_id))map.set(v.dataset_id,v);return map},[versions])
  const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects])
  const filtered=datasets.filter(d=>{const c=catalogByDataset.get(d.id);const hay=[d.name,d.description,d.source_identifier,d.business_domain,c?.business_description,(c?.tags??[]).join(' ')].join(' ').toLowerCase();return hay.includes(query.toLowerCase())})

  async function save(dataset:Dataset,form:HTMLFormElement){
    setBusy(true);setMessage('')
    try{
      const fd=new FormData(form)
      const body={
        businessDescription:String(fd.get('businessDescription')??''),
        lifecycleStatus:String(fd.get('lifecycleStatus')??'ACTIVE'),
        certificationStatus:String(fd.get('certificationStatus')??'UNCERTIFIED'),
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

  return <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Governed assets</h2><p className="mt-1 text-sm text-slate-500">{datasets.length} registered datasets</p></div><label className="relative min-w-[280px]"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, domain, tag, source…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"/></label></div>
    {message?<p className="mt-3 text-sm text-slate-600">{message}</p>:null}
    <div className="mt-5 space-y-3">{filtered.map(dataset=>{
      const c=catalogByDataset.get(dataset.id);const v=latestVersion.get(dataset.id);const project=projectById.get(dataset.project_id);const orgMembers=members.filter(m=>m.organization_id===project?.organization_id)
      return <article key={dataset.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{dataset.name}</h3><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{c?.certification_status??'UNCERTIFIED'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{c?.lifecycle_status??'ACTIVE'}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{c?.criticality??'MEDIUM'} criticality</span></div><p className="mt-1 text-sm text-slate-500">{c?.business_description||dataset.description||'No business description.'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{project?.name??'Project'}</span><span>·</span><span>{dataset.business_domain??'Unassigned domain'}</span><span>·</span><span>{dataset.source_identifier??'No source identifier'}</span><span>·</span><span>v{v?.version_number??'—'} {v?.status??''}</span>{v?.row_count!=null?<><span>·</span><span>{v.row_count} rows</span></>:null}</div><div className="mt-3 flex flex-wrap gap-2">{(c?.tags??[]).map(tag=><span key={tag} className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs font-semibold">#{tag}</span>)}</div></div><button onClick={()=>setEditing(editing===dataset.id?null:dataset.id)} className="rounded-xl border px-4 py-2 text-sm font-bold">{editing===dataset.id?'Close':'Edit governance metadata'}</button></div>
      {editing===dataset.id?<form onSubmit={e=>{e.preventDefault();void save(dataset,e.currentTarget)}} className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-2"><label className="text-xs font-bold">Business description<textarea name="businessDescription" defaultValue={c?.business_description??''} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-bold">Tags<input name="tags" defaultValue={(c?.tags??[]).join(', ')} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="customer, finance, gold"/></label><label className="text-xs font-bold">Lifecycle<select name="lifecycleStatus" defaultValue={c?.lifecycle_status??'ACTIVE'} className="mt-1 w-full rounded-lg border px-3 py-2"><option>DRAFT</option><option>ACTIVE</option><option>DEPRECATED</option><option>RETIRED</option></select></label><label className="text-xs font-bold">Certification<select name="certificationStatus" defaultValue={c?.certification_status??'UNCERTIFIED'} className="mt-1 w-full rounded-lg border px-3 py-2"><option>UNCERTIFIED</option><option>PENDING</option><option>CERTIFIED</option><option>REJECTED</option><option>EXPIRED</option></select></label><label className="text-xs font-bold">Criticality<select name="criticality" defaultValue={c?.criticality??'MEDIUM'} className="mt-1 w-full rounded-lg border px-3 py-2"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label className="text-xs font-bold">Retention days<input type="number" min="0" name="retentionDays" defaultValue={c?.retention_days??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>{[['technicalOwnerUserId','Technical owner',c?.technical_owner_user_id],['businessOwnerUserId','Business owner',c?.business_owner_user_id],['stewardUserId','Data steward',c?.steward_user_id]].map(([name,label,value])=><label key={String(name)} className="text-xs font-bold">{label}<select name={String(name)} defaultValue={String(value??'')} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Unassigned</option>{orgMembers.map(member=><option key={member.user_id+member.role} value={member.user_id}>{member.user_id.slice(0,8)} · {member.role}</option>)}</select></label>)}<div className="lg:col-span-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save metadata</button></div></form>:null}
      </article>
    })}</div>
  </section>
}
