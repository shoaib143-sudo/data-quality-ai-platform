'use client'
import { useState } from 'react'
import { Code2, Loader2, ScanSearch } from 'lucide-react'

const samples:Record<string,string>={
  DOTNET:'var sql = "insert into curated.Customer select * from raw.Customer";',
  NODEJS:'await db.query("merge into curated.customer using raw.customer on curated.customer.id=raw.customer.id");',
  VBA:'sql = "select CustomerId from dbo.Customer"\nWorkbooks.Open "C:\\\\data\\\\customer.xlsx"',
  MACRO:'sql = "insert into reporting.CustomerSummary select * from staging.Customer"',
  SCRIPT:'psql -c "create table curated.customer as select * from raw.customer"',
  LOG:'2026-10-01 INFO query="select * from finance.customer" endpoint=https://api.example.com/customers',
}
type Project={id:string;name:string;canPersist:boolean}
export function SourceArtifactScanWorkbench({projects}:{projects:Project[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const selectedProject=projects.find(project=>project.id===projectId)
  const [kind,setKind]=useState('DOTNET')
  const [path,setPath]=useState('Jobs/CustomerLoad.cs')
  const [content,setContent]=useState(samples.DOTNET)
  const [repositoryUrl,setRepositoryUrl]=useState('')
  const [repositoryRef,setRepositoryRef]=useState('')
  const [result,setResult]=useState<Record<string,unknown>|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function run(persist=false){
    setBusy(true);setError('');setResult(null)
    try{
      const response=await fetch('/api/catalog/source-artifact/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,path,content,projectId,persist})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Artifact scan failed.')
      setResult(body)
    }catch(cause){setError(cause instanceof Error?cause.message:'Artifact scan failed.')}finally{setBusy(false)}
  }
  async function scanRepository(persist=false){
    if(!repositoryUrl.trim()){setError('Enter a GitHub repository URL first.');return}
    setBusy(true);setError('');setResult(null)
    try{
      const response=await fetch('/api/catalog/source-artifact/github',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repositoryUrl,ref:repositoryRef,projectId,persist})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'GitHub repository scan failed.')
      setResult(body)
    }catch(cause){setError(cause instanceof Error?cause.message:'GitHub repository scan failed.')}finally{setBusy(false)}
  }
  function choose(value:string){
    setKind(value);setContent(samples[value]??'')
    setPath(value==='DOTNET'?'Jobs/CustomerLoad.cs':value==='NODEJS'?'jobs/customer-load.js':value==='VBA'||value==='MACRO'?'CustomerLoad.xlsm!Module1':value==='LOG'?'logs/etl.log':'scripts/customer-load.sql')
  }
  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><div className="flex items-center gap-2"><Code2 className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-black">Source artifact scanner</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">Technical metadata extraction for .NET, Node.js, VBA/macros, scripts and logs. Secret-like values are redacted. Persisted scans store only extracted references, hashes and transformation evidence, never source content.</p><label className="mt-4 block text-xs font-bold text-slate-300">Governed project<select value={projectId} onChange={e=>setProjectId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-2">{Object.keys(samples).map(item=><button key={item} type="button" onClick={()=>choose(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${kind===item?'bg-cyan-600 text-white':'bg-white/[0.05] text-slate-400'}`}>{item}</button>)}</div><label className="mt-4 block text-xs font-bold text-slate-300">Artifact path<input value={path} onChange={e=>setPath(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs font-bold text-slate-300">Content<textarea value={content} onChange={e=>setContent(e.target.value)} rows={18} className="mt-1 w-full rounded-2xl border border-white/10 bg-[#07101c] p-4 font-mono text-xs leading-5 text-slate-200"/></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>void run(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ScanSearch className="h-4 w-4"/>}Scan dry run</button><button type="button" onClick={()=>void run(true)} disabled={busy||!projectId||!selectedProject?.canPersist} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-50">Persist governed scan</button></div><div className="mt-5 border-t border-white/[0.08] pt-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Automated GitHub acquisition</p><p className="mt-1 text-xs leading-5 text-slate-500">Scan a bounded GitHub repository/ref with automatic artifact-type detection. Public repositories need no credential; private repositories require the server-managed GITHUB_SOURCE_SCAN_TOKEN. Source content is never persisted.</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]"><label className="text-xs font-bold text-slate-300">Repository URL<input value={repositoryUrl} onChange={e=>setRepositoryUrl(e.target.value)} placeholder="https://github.com/org/repo" className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white"/></label><label className="text-xs font-bold text-slate-300">Ref<input value={repositoryRef} onChange={e=>setRepositoryRef(e.target.value)} placeholder="default branch" className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white"/></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void scanRepository(false)} disabled={busy||!repositoryUrl.trim()} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-sm font-bold text-violet-200 hover:bg-violet-400/15 disabled:opacity-50">Scan GitHub dry run</button><button type="button" onClick={()=>void scanRepository(true)} disabled={busy||!repositoryUrl.trim()||!projectId||!selectedProject?.canPersist} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-50">Persist GitHub scan</button></div></div>{selectedProject&&!selectedProject.canPersist?<p className="mt-2 text-xs text-amber-300">Dry-run scanning is available. source.manage permission is required to persist extracted metadata.</p>:null}{error?<p className="mt-3 text-sm text-rose-300">{error}</p>:null}</section><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-wide text-violet-300">Extracted metadata</p>{result?<pre className="mt-4 max-h-[680px] overflow-auto rounded-2xl border border-white/[0.07] bg-[#07101c] p-4 text-[11px] leading-5 text-slate-300">{JSON.stringify(result,null,2)}</pre>:<p className="mt-4 text-sm leading-6 text-slate-500">Scan an artifact to inspect deterministic database reads/writes, file references, endpoints, transformation hints, hash and line evidence. Persisted mode records only the extracted metadata and content hash.</p>}</section></div>
}
