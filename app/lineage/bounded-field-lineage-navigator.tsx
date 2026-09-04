'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, Columns3, Loader2, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'

type Project={id:string;name:string}
type Direction='UPSTREAM'|'DOWNSTREAM'|'BOTH'
type FieldRef={assetId:string;columnName:string}
type FieldAnchor=FieldRef&{label:string;subtitle:string|null;datasetId:string|null;assetType:string|null;matchRank:number}
type FieldNode=FieldRef&{label:string;datasetId:string|null;assetType:string|null;metadata:Record<string,unknown>}
type FieldEdge={id:string;source:FieldRef;target:FieldRef;operation:string|null;expression:string|null;transformationId:string|null;transformation:Record<string,unknown>|null;depth:number;metadata:Record<string,unknown>}
type Neighborhood={projectId:string;anchor:FieldRef;direction:Direction;requestedDepth:number;maxEdges:number;nodeCount:number;edgeCount:number;truncated:boolean;exhausted:boolean;nodes:FieldNode[];edges:FieldEdge[];limits:{maxDepth:number;maxEdges:number;maxFrontierNodes:number};provider:string}

export function BoundedFieldLineageNavigator({projects}:{projects:Project[]}){
  const pathname=usePathname()
  const [open,setOpen]=useState(false)
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [query,setQuery]=useState('')
  const [anchors,setAnchors]=useState<FieldAnchor[]>([])
  const [anchor,setAnchor]=useState<FieldAnchor|null>(null)
  const [direction,setDirection]=useState<Direction>('BOTH')
  const [depth,setDepth]=useState(2)
  const [maxEdges,setMaxEdges]=useState(120)
  const [anchorLoading,setAnchorLoading]=useState(false)
  const [graphLoading,setGraphLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [neighborhood,setNeighborhood]=useState<Neighborhood|null>(null)

  const nodeByKey=useMemo(()=>new Map((neighborhood?.nodes??[]).map(node=>[key(node),node])),[neighborhood])

  useEffect(()=>{
    if(!open||!projectId)return
    const controller=new AbortController()
    const timer=window.setTimeout(async()=>{
      setAnchorLoading(true);setError(null)
      try{
        const params=new URLSearchParams({projectId,q:query,limit:'25'})
        const response=await fetch(`/api/lineage/field-anchors?${params.toString()}`,{signal:controller.signal,cache:'no-store'})
        const payload=await response.json()
        if(!response.ok)throw new Error(payload.error??'Unable to search field lineage anchors.')
        setAnchors(Array.isArray(payload.anchors)?payload.anchors:[])
      }catch(cause){if((cause as Error).name!=='AbortError')setError(cause instanceof Error?cause.message:'Unable to search field lineage anchors.')}
      finally{if(!controller.signal.aborted)setAnchorLoading(false)}
    },200)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[open,projectId,query])

  useEffect(()=>{
    if(!open||!projectId||!anchor)return
    const controller=new AbortController()
    setGraphLoading(true);setError(null)
    const params=new URLSearchParams({projectId,assetId:anchor.assetId,columnName:anchor.columnName,direction,depth:String(depth),maxEdges:String(maxEdges)})
    fetch(`/api/lineage/field-neighborhood?${params.toString()}`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error??'Unable to load field lineage neighborhood.');return payload as Neighborhood})
      .then(setNeighborhood)
      .catch(cause=>{if((cause as Error).name!=='AbortError')setError(cause instanceof Error?cause.message:'Unable to load field lineage neighborhood.')})
      .finally(()=>{if(!controller.signal.aborted)setGraphLoading(false)})
    return()=>controller.abort()
  },[open,projectId,anchor,direction,depth,maxEdges])

  if(pathname!=='/lineage'||!projects.length)return null

  function key(ref:FieldRef){return `${ref.assetId}:${ref.columnName.trim().toLowerCase()}`}
  function label(ref:FieldRef){return nodeByKey.get(key(ref))?.label??`${ref.columnName} · ${ref.assetId.slice(0,8)}`}
  function chooseProject(value:string){setProjectId(value);setQuery('');setAnchor(null);setNeighborhood(null)}
  function pivot(ref:FieldRef){const node=nodeByKey.get(key(ref));setAnchor({assetId:ref.assetId,columnName:ref.columnName,label:node?.label??label(ref),subtitle:'Expanded from current field neighborhood',datasetId:node?.datasetId??null,assetType:node?.assetType??null,matchRank:0});setNeighborhood(null);setQuery('')}

  return <>
    <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-6 right-48 z-40 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-xl shadow-blue-200/60 transition hover:bg-blue-800"><Columns3 className="h-4 w-4"/>Field lineage</button>
    {open?<div className="fixed inset-0 z-50 bg-slate-950/35 p-3 sm:p-6" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}>
      <section className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4"><div><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"><Columns3 className="h-3.5 w-3.5"/>Field GraphProvider traversal</div><h2 className="mt-2 text-xl font-black text-slate-900">Bounded field lineage</h2><p className="mt-1 text-sm text-slate-500">Search a persisted mapped field, then pivot upstream or downstream without preloading the mapping estate.</p></div><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4"/></button></header>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-r bg-slate-50/60 p-4">
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Project</label><select value={projectId} onChange={event=>chooseProject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-300">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <label className="mt-4 block text-[11px] font-black uppercase tracking-wide text-slate-400">Mapped field</label><div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Column or lineage asset" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-300"/></div>
            <div className="mt-2 space-y-1.5">{anchorLoading?<div className="flex items-center gap-2 p-3 text-xs font-bold text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>Searching mapped fields</div>:null}{!anchorLoading&&anchors.map(item=><button key={key(item)} type="button" onClick={()=>{setAnchor(item);setNeighborhood(null)}} className={`w-full rounded-xl border p-3 text-left transition ${anchor&&key(anchor)===key(item)?'border-blue-300 bg-blue-50':'border-slate-200 bg-white hover:border-blue-200'}`}><p className="truncate text-xs font-black text-slate-800">{item.label}</p><p className="mt-1 truncate text-[10px] text-slate-400">{item.subtitle||item.assetType||'FIELD'}</p></button>)}{!anchorLoading&&!anchors.length?<p className="rounded-xl border border-dashed p-3 text-xs text-slate-400">No persisted field mappings match this project/search.</p>:null}</div>
          </aside>
          <main className="min-w-0 overflow-y-auto p-5">
            {anchor?<><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-blue-600">FIELD</p><h3 className="text-lg font-black text-slate-900">{anchor.label}</h3>{anchor.subtitle?<p className="mt-0.5 text-[10px] font-semibold text-slate-400">{anchor.subtitle}</p>:null}</div><div className="flex flex-wrap gap-2">{(['UPSTREAM','BOTH','DOWNSTREAM'] as Direction[]).map(value=>{const Icon=value==='UPSTREAM'?ArrowUp:value==='DOWNSTREAM'?ArrowDown:ArrowRight;return <button key={value} type="button" onClick={()=>setDirection(value)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-black ${direction===value?'border-blue-300 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500'}`}><Icon className="h-3.5 w-3.5"/>{value}</button>})}</div></div>
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50 p-3"><span className="text-xs font-bold text-slate-500">Depth</span>{[1,2,3,4].map(value=><button key={value} type="button" onClick={()=>setDepth(value)} className={`h-8 w-8 rounded-lg text-xs font-black ${depth===value?'bg-blue-700 text-white':'border bg-white text-slate-600'}`}>{value}</button>)}<span className="ml-auto text-xs font-bold text-slate-500">Edge bound</span>{[60,120,240].map(value=><button key={value} type="button" onClick={()=>setMaxEdges(value)} className={`rounded-lg px-2.5 py-2 text-[10px] font-black ${maxEdges===value?'bg-blue-700 text-white':'border bg-white text-slate-600'}`}>{value}</button>)}</div>
              {graphLoading?<div className="mt-8 flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-400"><Loader2 className="h-5 w-5 animate-spin"/>Traversing bounded field neighborhood</div>:null}
              {!graphLoading&&neighborhood?<><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Fields" value={neighborhood.nodeCount}/><MiniStat label="Mappings" value={neighborhood.edgeCount}/><MiniStat label="Depth" value={neighborhood.requestedDepth}/></div>{neighborhood.truncated?<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700">Field traversal reached the configured bound. Pivot to a returned field or narrow the direction.</div>:null}<div className="mt-4 space-y-2">{neighborhood.edges.map(edge=><article key={edge.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"><button type="button" onClick={()=>pivot(edge.source)} className="min-w-0 rounded-lg p-1 text-left hover:bg-blue-50"><p className="text-[9px] font-black uppercase text-blue-500">SOURCE FIELD</p><p className="truncate text-xs font-bold text-slate-800">{label(edge.source)}</p><p className="mt-0.5 text-[9px] font-semibold text-blue-500">Use as anchor</p></button><div className="flex items-center justify-center gap-1 text-[10px] font-black text-slate-400"><span>{edge.operation||'MAP'}</span><ChevronRight className="h-3.5 w-3.5"/></div><button type="button" onClick={()=>pivot(edge.target)} className="min-w-0 rounded-lg p-1 text-left hover:bg-violet-50"><p className="text-[9px] font-black uppercase text-violet-500">TARGET FIELD</p><p className="truncate text-xs font-bold text-slate-800">{label(edge.target)}</p><p className="mt-0.5 text-[9px] font-semibold text-violet-500">Use as anchor</p></button></div>{edge.expression?<p className="mt-2 line-clamp-3 break-all rounded-lg bg-slate-50 p-2 font-mono text-[9px] text-slate-500">{edge.expression}</p>:null}<p className="mt-2 text-[9px] font-semibold text-slate-400">Traversal depth {edge.depth}</p></article>)}{!neighborhood.edges.length?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">No persisted field mappings were found around this anchor.</p>:null}</div></>:null}
            </>:<div className="grid min-h-[360px] place-items-center text-center"><div><Columns3 className="mx-auto h-11 w-11 text-slate-300"/><h3 className="mt-3 font-black text-slate-800">Choose a mapped field</h3><p className="mt-1 max-w-sm text-sm text-slate-500">Field anchors come only from explicit persisted column mappings. No name-based lineage inference is performed.</p></div></div>}{error?<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>:null}
          </main>
        </div>
      </section>
    </div>:null}
  </>
}

function MiniStat({label,value}:{label:string;value:number}){return <div className="rounded-xl border bg-white p-3 text-center"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-800">{value}</p></div>}
