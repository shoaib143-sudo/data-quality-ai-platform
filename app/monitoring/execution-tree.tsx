'use client'
import { useMemo, useId, useState } from 'react'
import { displayState, type Snapshot } from '@/lib/monitoring/execution-contract'
import { treeLayout, branchPath } from './execution-tree-layout'
export const STATE_COLORS={running:'#56e4ff',complete:'#62e99c',waiting:'#f4bd55',failed:'#fb7185',queued:'#71859d',cancelled:'#94a3b8',skipped:'#94a3b8',unknown:'#a8a1bd'}
export function ExecutionTree({snapshot,selectedId,onSelect,stale,allLinks}:{snapshot:Snapshot;selectedId:string;onSelect:(id:string)=>void;stale:boolean;allLinks:boolean}) {
  const [zoom,setZoom]=useState(1)
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set())
  const marker=useId().replaceAll(':','')
  const topology=snapshot.runs.map(r=>`${r.id}:${r.parent_run_id}:${r.created_at}`).join('|')
  // Layout depends on identities and ownership, never status or progress.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout=useMemo(()=>treeLayout(snapshot.runs,snapshot.rootId),[topology,snapshot.rootId])
  const root=layout.positions.get(snapshot.rootId)!
  const byId=new Map(snapshot.runs.map(r=>[r.id,r]))
  const visible=snapshot.runs.filter(run=>{
    let parent=run.parent_run_id
    while(parent){if(collapsed.has(parent))return false;parent=byId.get(parent)?.parent_run_id??null}
    return true
  })
  const visibleIds=new Set(visible.map(r=>r.id))
  const selectedHasChildren=snapshot.runs.some(r=>r.parent_run_id===selectedId)
  const toggleCollapse=()=>setCollapsed(current=>{const next=new Set(current);if(next.has(selectedId))next.delete(selectedId);else next.add(selectedId);return next})
  const trunkState=displayState(snapshot.runs[0],snapshot)
  const trunkPath=`M ${root.x} ${root.y+65} C ${root.x-32} ${root.y+15} ${root.x+15} ${root.y-30} ${root.x} ${root.y}`

  return <div><div className="tree-controls tree-toolbar"><button onClick={()=>setZoom(z=>Math.max(.5,z-.25))} aria-label="Zoom out">−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(3,z+.25))} aria-label="Zoom in">+</button><button onClick={()=>setZoom(1)}>Fit tree</button>{selectedHasChildren?<button onClick={toggleCollapse}>{collapsed.has(selectedId)?'Expand selected branch':'Collapse selected branch'}</button>:null}{collapsed.size?<button onClick={()=>setCollapsed(new Set())}>Expand all</button>:null}<span className="tree-subtle">{visible.length} visible runs · scroll to pan</span></div><div className="tree-scroll" aria-label="Execution tree canvas"><svg role="group" aria-label="Living Tree. Solid branches show ownership; dotted arrows show prerequisites." viewBox={`0 0 ${layout.width} ${layout.height}`} style={{width:`${zoom*100}%`,minWidth:Math.min(layout.width,1200)*zoom}}>
    <defs><radialGradient id={`${marker}-halo`}><stop stopColor="#0e7490" stopOpacity=".25"/><stop offset="1" stopColor="#0b1424" stopOpacity="0"/></radialGradient><marker id={`${marker}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#d4a550"/></marker></defs>
    <ellipse cx={root.x} cy={root.y-220} rx="480" ry="450" fill={`url(#${marker}-halo)`}/>
    <path d={`M ${root.x} ${root.y+65} C ${root.x-32} ${root.y+15} ${root.x+15} ${root.y-30} ${root.x} ${root.y}`} stroke={STATE_COLORS[trunkState]} strokeOpacity=".4" strokeWidth="28" fill="none" strokeLinecap="round"/>
    {trunkState==='running'&&!stale?<path className="tree-pulse" d={trunkPath} pathLength="100" fill="none" stroke={STATE_COLORS.running} strokeWidth="5" strokeDasharray="2 20"/>:null}
    {[-160,-100,-50,55,110,170].map((dx,i)=><path key={dx} d={`M ${root.x} ${root.y+45} Q ${root.x+dx*.5} ${root.y+80} ${root.x+dx} ${root.y+100+(i%2)*15}`} fill="none" stroke="#2d5268" strokeWidth={3+(i%3)} />)}
    {visible.filter(r=>r.id!==snapshot.rootId).map(run=>{
      const parent=layout.positions.get(run.parent_run_id??'');const p=layout.positions.get(run.id);if(!parent||!p)return null
      const state=displayState(run,snapshot);const color=STATE_COLORS[state];const path=branchPath(parent,p)
      return <g key={run.id}><path d={path} fill="none" stroke="#253b4d" strokeWidth={Math.max(7,23-p.depth*4)} strokeLinecap="round"/><path d={path} fill="none" stroke={color} strokeOpacity=".55" strokeWidth="4"/><path d={path} fill="none" stroke={color} strokeWidth="2" transform="translate(5 0)" opacity=".35"/>{state==='running'&&!stale?<path className="tree-pulse" d={path} pathLength="100" fill="none" stroke={color} strokeWidth="5" strokeDasharray="2 20"/>:null}
      {[-1,1].map(side=><g key={side}><path d={`M${p.x} ${p.y+65} Q${p.x+side*35} ${p.y+45} ${p.x+side*48} ${p.y+12}`} fill="none" stroke={color} strokeOpacity=".5" strokeWidth="2"/><path d={`M${p.x+side*28} ${p.y+42} Q${p.x+side*68} ${p.y+40} ${p.x+side*47} ${p.y+14} Q${p.x+side*22} ${p.y+17} ${p.x+side*28} ${p.y+42}`} fill={color} fillOpacity=".16" stroke={color} strokeOpacity=".4"/></g>)}
      </g>
    })}
    {snapshot.steps.filter(s=>s.agent_run_id===selectedId&&visibleIds.has(selectedId)).slice(0,3).map((step,index)=>{
      const p=layout.positions.get(selectedId);if(!p)return null
      const x=p.x+(index-1)*75,y=p.y+100+(index%2)*20
      const color=step.status==='SUCCEEDED'?'#62e99c':step.status==='RUNNING'?'#56e4ff':step.status==='FAILED'?'#fb7185':'#71859d'
      return <g key={step.id}><path d={`M${p.x} ${p.y+20} Q${p.x} ${y-20} ${x} ${y}`} stroke={color} strokeWidth="1.5" fill="none"/><ellipse cx={x} cy={y} rx="9" ry="16" transform={`rotate(35 ${x} ${y})`} fill={color} fillOpacity=".3" stroke={color}/><title>{step.step_name}: {step.status}; attempt {step.attempt}</title></g>
    })}
    {snapshot.edges.filter(e=>allLinks||e.source===selectedId||e.target===selectedId).map(e=>{
      const a=layout.positions.get(e.source),b=layout.positions.get(e.target);if(!a||!b||!visibleIds.has(e.source)||!visibleIds.has(e.target))return null
      return <path key={e.id} d={`M${a.x+10} ${a.y-25} Q${(a.x+b.x)/2} ${Math.min(a.y,b.y)-130} ${b.x-10} ${b.y-25}`} fill="none" stroke={e.satisfied?'#62e99c':'#d4a550'} strokeWidth="2" strokeDasharray="3 7" markerEnd={`url(#${marker}-arrow)`}><title>{e.condition==='SUCCESS'?'Requires successful completion':'Requires terminal completion'}; {e.satisfied?'satisfied':'waiting'}</title></path>
    })}
    {visible.map(run=>{const p=layout.positions.get(run.id)!;const state=displayState(run,snapshot);const color=STATE_COLORS[state];return <g key={run.id} role="button" tabIndex={0} aria-label={`${run.name??'Agent'}: ${state}`} aria-pressed={selectedId===run.id} className="tree-node" onClick={()=>onSelect(run.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(run.id)}}}>
      <rect x={p.x-92} y={p.y-55} width="184" height="66" rx="15" fill="#0d1e30" stroke={selectedId===run.id?'#fff':color} strokeWidth={selectedId===run.id?2:1}/><circle cx={p.x-74} cy={p.y-21} r="4" fill={color}/>{run.id===snapshot.rootId?<text x={p.x} y={p.y-66} textAnchor="middle" fill="#91a6bf" fontSize="11">ROOT EXECUTION</text>:null}<text x={p.x} y={p.y-32} textAnchor="middle" fill="#eaf1fa" fontSize="14">{(run.name??'Agent').slice(0,22)}</text><text x={p.x} y={p.y-10} textAnchor="middle" fill={color} fontSize="12">{state.toUpperCase()}</text>{collapsed.has(run.id)?<text x={p.x} y={p.y+31} textAnchor="middle" fill="#cbd5e1" fontSize="11">Branches collapsed</text>:null}<title>{run.name} · {run.id} · {run.status}</title>
    </g>})}
  </svg></div>{snapshot.steps.filter(s=>s.agent_run_id===selectedId).length>3?<p className="tree-subtle tree-toolbar">First 3 step leaves shown. All recorded steps are available in branch details.</p>:null}</div>
}
