'use client'
import { useState } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'

const samples:Record<string,unknown>={
  POWER_BI:{items:[{id:'model-1',type:'semantic model',name:'Customer 360 Model',workspace:'Finance',sources:['warehouse.customer'],metadata:{refresh:'scheduled'}}]},
  TABLEAU:{items:[{id:'wb-1',type:'workbook',name:'Customer 360',project:'Analytics',sources:['warehouse.customer']}]},
  LOOKER:{items:[{id:'exp-1',type:'explore',name:'customer_explore',project:'commerce',sources:['warehouse.customer_fact']}]},
}

export function BiMetadataWorkbench(){
  const [provider,setProvider]=useState('POWER_BI')
  const [payload,setPayload]=useState(JSON.stringify(samples.POWER_BI,null,2))
  const [result,setResult]=useState<Record<string,unknown>|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  function choose(value:string){setProvider(value);setPayload(JSON.stringify(samples[value],null,2));setResult(null);setError('')}
  async function run(){
    setBusy(true);setError('');setResult(null)
    try{
      const response=await fetch('/api/catalog/bi/normalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,payload:JSON.parse(payload)})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'BI metadata normalization failed.')
      setResult(body)
    }catch(cause){setError(cause instanceof Error?cause.message:'BI metadata normalization failed.')}finally{setBusy(false)}
  }
  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-black">BI metadata adapter</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">Normalize exported Power BI, Tableau or Looker metadata into DataNexus BI assets before governed persistence and lineage ingestion.</p><div className="mt-4 flex gap-2">{Object.keys(samples).map(item=><button key={item} type="button" onClick={()=>choose(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${provider===item?'bg-cyan-600 text-white':'bg-white/[0.05] text-slate-400'}`}>{item.replace('_',' ')}</button>)}</div><textarea value={payload} onChange={e=>setPayload(e.target.value)} rows={20} className="mt-4 w-full rounded-2xl border border-white/10 bg-[#07101c] p-4 font-mono text-xs leading-5 text-slate-200"/><button type="button" onClick={()=>void run()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<BarChart3 className="h-4 w-4"/>}Normalize BI metadata</button>{error?<p className="mt-3 text-sm text-rose-300">{error}</p>:null}</section><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-wide text-violet-300">Normalized BI assets</p>{result?<pre className="mt-4 max-h-[640px] overflow-auto rounded-2xl border border-white/[0.07] bg-[#07101c] p-4 text-[11px] leading-5 text-slate-300">{JSON.stringify(result,null,2)}</pre>:<p className="mt-4 text-sm leading-6 text-slate-500">Select a provider and normalize a metadata export. The current implementation is a safe dry-run adapter layer and does not call vendor APIs or incur external cost.</p>}</section></div>
}
