'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, GitBranch, Loader2, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'

type Project={id:string;name:string}
type Anchor={type:string;id:string;label:string;subtitle:string|null;matchRank:number;metadata:Record<string,unknown>}
type GraphNode={type:string;id:string;label:string;metadata:Record<string,unknown>}
type GraphEdge={id:string;source:{type:string;id:string};target:{type:string;id:string};relationship:string;depth:number;metadata:Record<string,unknown>;transformation?:Record<string,unknown>|null}
type Neighborhood={
  projectId:string
  anchor:{type:string;id:string}
  direction:'UPSTREAM'|'DOWNSTREAM'|'BOTH'
  requestedDepth:number
  maxEdges:number
  nodeCount:number
  edgeCount:number
  truncated:boolean
  exhausted:boolean
  nodes:GraphNode[]
  edges:GraphEdge[]
  limits:{maxDepth:number;maxEdges:number;maxFrontierNodes?:number}
}

type Direction='UPSTREAM'|'DOWNSTREAM'|'BOTH'

export function BoundedLineageNavigator({projects}:{projects:Project[]}){
  const pathname=usePathname()
  const [open,setOpen]=useState(false)
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [query,setQuery]=useState('')
  const [anchors,setAnchors]=useState<Anchor[]>([])
  const [anchor,setAnchor]=useState<Anchor|null>(null)
  const [direction,setDirection]=useState<Direction>('BOTH')
  const [depth,setDepth]=useState(2)
  const [maxEdges,setMaxEdges]=useState(120)
  const [anchorLoading,setAnchorLoading]=useState(false)
  const [graphLoading,setGraphLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [neighborhood,setNeighborhood]=useState<Neighborhood|null>(null)

  const nodeByKey=useMemo(()=>new Map((neighborhood?.nodes??[]).map(node=>[`${node.type}:${node.id}`,node])),[neighborhood])

  useEffect(()=>{
    if(!open||!projectId)return
    const controller=new AbortController()
    const timer=window.setTimeout(async()=>{
      setAnchorLoading(true)
      setError(null)
      try{
        const params=new URLSearchParams({projectId,q:query,limit:'25'})
        const response=await fetch(`/api/lineage/anchors?${params.toString()}`,{signal:controller.signal,cache:'no-store'})
        const payload=await response.json()
        if(!response.ok)throw new Error(payload.error??'Unable to search lineage anchors.')
        setAnchors(Array.isArray(payload.anchors)?payload.anchors:[])
      }catch(cause){
        if((cause as Error).name!=='AbortError')setError(cause instanceof Error?cause.message:'Unable to search lineage anchors.')
      }finally{
        if(!controller.signal.aborted)setAnchorLoading(false)
      }
    },200)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[open,projectId,query])

  useEffect(()=>{
    if(!open||!projectId||!anchor)return
    const controller=new AbortController()
    setGraphLoading(true)
    setError(null)
    const params=new URLSearchParams({
      projectId,
      anchorType:anchor.type,
      anchorId:anchor.id,
      direction,
      depth:String(depth),
      maxEdges:String(maxEdges),
    })
    fetch(`/api/lineage/neighborhood?${params.toString()}`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{
        const payload=await response.json()
        if(!response.ok)throw new Error(payload.error??'Unable to load lineage neighborhood.')
        return payload as Neighborhood
      })
      .then(setNeighborhood)
      .catch(cause=>{if((cause as Error).name!=='AbortError')setError(cause instanceof Error?cause.message:'Unable to load lineage neighborhood.')})
      .finally(()=>{if(!controller.signal.aborted)setGraphLoading(false)})
    return()=>controller.abort()
  },[open,projectId,anchor,direction,depth,maxEdges])

  if(pathname!=='/lineage'||!projects.length)return null

  function chooseProject(value:string){
    setProjectId(value)
    setAnchor(null)
    setNeighborhood(null)
    setQuery('')
  }

  function label(ref:{type:string;id:string}){
    return nodeByKey.get(`${ref.type}:${ref.id}`)?.label??`${ref.type} ${ref.id.slice(0,8)}`
  }

  function pivot(ref:{type:string;id:string}){
    const node=nodeByKey.get(`${ref.type}:${ref.id}`)
    setAnchor({
      type:ref.type,
      id:ref.id,
      label:node?.label??`${ref.type} ${ref.id.slice(0,8)}`,
      subtitle:'Expanded from current neighborhood',
      matchRank:0,
      metadata:node?.metadata??{},
    })
    setNeighborhood(null)
    setQuery('')
  }

  return <>
    <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-700 px-4 py-3 text-sm font-black text-white shadow-xl shadow-violet-200/60 transition hover:bg-violet-800">
      <GitBranch className="h-4 w-4"/>Bounded lineage
    </button>

    {open?<div className="fixed inset-0 z-50 bg-slate-950/35 p-3 sm:p-6" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}>
      <section className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div><div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700"><GitBranch className="h-3.5 w-3.5"/>GraphProvider traversal</div><h2 className="mt-2 text-xl font-black text-slate-900">Bounded lineage neighborhood</h2><p className="mt-1 text-sm text-slate-500">Anchor-driven traversal only. Click any returned node to continue exploring without loading the whole estate.</p></div>
          <button type="button" onClick={()=>setOpen(false)} className="rounded-xl border p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4"/></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-r bg-slate-50/60 p-4">
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Project</label>
            <select value={projectId} onChange={event=>chooseProject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-300">
              {projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
            </select>

            <label className="mt-4 block text-[11px] font-black uppercase tracking-wide text-slate-400">Anchor</label>
            <div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Dataset, source or asset" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-300"/></div>
            <div className="mt-2 space-y-1.5">
              {anchorLoading?<div className="flex items-center gap-2 p-3 text-xs font-bold text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>Searching anchors</div>:null}
              {!anchorLoading&&anchors.map(item=><button key={`${item.type}:${item.id}`} type="button" onClick={()=>{setAnchor(item);setNeighborhood(null)}} className={`w-full rounded-xl border p-3 text-left transition ${anchor?.id===item.id&&anchor.type===item.type?'border-violet-300 bg-violet-50':'border-slate-200 bg-white hover:border-violet-200'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{item.label}</p><p className="mt-1 truncate text-[10px] text-slate-400">{item.subtitle||item.type}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{item.type}</span></div></button>)}
              {!anchorLoading&&!anchors.length?<p className="rounded-xl border border-dashed p-3 text-xs text-slate-400">No matching anchors.</p>:null}
            </div>
          </aside>

          <main className="min-w-0 overflow-y-auto p-5">
            {anchor?<>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-wide text-violet-600">{anchor.type}</p><h3 className="text-lg font-black text-slate-900">{anchor.label}</h3>{anchor.subtitle?<p className="mt-0.5 text-[10px] font-semibold text-slate-400">{anchor.subtitle}</p>:null}</div>
                <div className="flex flex-wrap gap-2">
                  {(['UPSTREAM','BOTH','DOWNSTREAM'] as Direction[]).map(value=>{const Icon=value==='UPSTREAM'?ArrowUp:value==='DOWNSTREAM'?ArrowDown:ArrowRight;return <button key={value} type="button" onClick={()=>setDirection(value)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-black ${direction===value?'border-violet-300 bg-violet-50 text-violet-700':'border-slate-200 text-slate-500'}`}><Icon className="h-3.5 w-3.5"/>{value}</button>})}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50 p-3">
                <span className="text-xs font-bold text-slate-500">Depth</span>{[1,2,3,4].map(value=><button key={value} type="button" onClick={()=>setDepth(value)} className={`h-8 w-8 rounded-lg text-xs font-black ${depth===value?'bg-violet-700 text-white':'border bg-white text-slate-600'}`}>{value}</button>)}
                <span className="ml-auto text-xs font-bold text-slate-500">Edge bound</span>{[60,120,240].map(value=><button key={value} type="button" onClick={()=>setMaxEdges(value)} className={`rounded-lg px-2.5 py-2 text-[10px] font-black ${maxEdges===value?'bg-violet-700 text-white':'border bg-white text-slate-600'}`}>{value}</button>)}
              </div>

              {graphLoading?<div className="mt-8 flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-400"><Loader2 className="h-5 w-5 animate-spin"/>Traversing bounded neighborhood</div>:null}
              {!graphLoading&&neighborhood?<>
                <div className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Nodes" value={neighborhood.nodeCount}/><MiniStat label="Edges" value={neighborhood.edgeCount}/><MiniStat label="Depth" value={neighborhood.requestedDepth}/></div>
                {neighborhood.truncated?<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700">Traversal reached the configured edge bound. Pivot to a returned node, narrow direction, or reduce depth for a more focused view.</div>:null}
                <div className="mt-4 space-y-2">{neighborhood.edges.map(edge=><article key={edge.id} className="rounded-xl border border-slate-200 p-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"><button type="button" onClick={()=>pivot(edge.source)} className="min-w-0 rounded-lg p-1 text-left transition hover:bg-blue-50"><p className="text-[9px] font-black uppercase text-blue-500">{edge.source.type}</p><p className="truncate text-xs font-bold text-slate-800">{label(edge.source)}</p><p className="mt-0.5 text-[9px] font-semibold text-blue-500">Use as anchor</p></button><div className="flex items-center justify-center gap-1 text-[10px] font-black text-slate-400"><span>{edge.relationship}</span><ChevronRight className="h-3.5 w-3.5"/></div><button type="button" onClick={()=>pivot(edge.target)} className="min-w-0 rounded-lg p-1 text-left transition hover:bg-violet-50"><p className="text-[9px] font-black uppercase text-violet-500">{edge.target.type}</p><p className="truncate text-xs font-bold text-slate-800">{label(edge.target)}</p><p className="mt-0.5 text-[9px] font-semibold text-violet-500">Use as anchor</p></button></div><p className="mt-2 text-[9px] font-semibold text-slate-400">Traversal depth {edge.depth}</p></article>)}
                  {!neighborhood.edges.length?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">No persisted lineage edges were found around this anchor.</p>:null}
                </div>
              </>:null}
            </>:<div className="grid min-h-[360px] place-items-center text-center"><div><GitBranch className="mx-auto h-11 w-11 text-slate-300"/><h3 className="mt-3 font-black text-slate-800">Choose an anchor</h3><p className="mt-1 max-w-sm text-sm text-slate-500">Search an authorized dataset, data source, or external lineage asset to load only its bounded neighborhood.</p></div></div>}

            {error?<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>:null}
          </main>
        </div>
      </section>
    </div>:null}
  </>
}

function MiniStat({label,value}:{label:string;value:number}){return <div className="rounded-xl border bg-white p-3 text-center"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-800">{value}</p></div>}
