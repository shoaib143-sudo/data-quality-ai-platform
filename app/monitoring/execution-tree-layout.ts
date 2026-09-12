import { ownershipDepths, type Run } from '@/lib/monitoring/execution-contract'
export type Position = {x:number;y:number;depth:number}
export function treeLayout(runs:Run[],rootId:string) {
  const depths=ownershipDepths(runs,rootId)
  const children=new Map<string,Run[]>()
  for(const r of runs) if(r.parent_run_id) {const list=children.get(r.parent_run_id)??[];list.push(r);children.set(r.parent_run_id,list)}
  for(const list of children.values()) list.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))
  const maxDepth=Math.max(0,...depths.values())
  const rootY=160+Math.max(1,maxDepth)*200
  const positions=new Map<string,Position>();let leaf=0
  const place=(id:string):number=>{
    const kids=children.get(id)??[]
    const xs=kids.map(k=>place(k.id));const x=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:120+leaf++*210
    positions.set(id,{x,y:rootY-(depths.get(id)??0)*200,depth:depths.get(id)??0});return x
  }
  place(rootId)
  const minY=Math.min(...[...positions.values()].map(p=>p.y))
  const shift=Math.max(0,120-minY)
  const xShift=Math.max(0,(900-(leaf*210+120))/2)
  for(const p of positions.values()){p.y+=shift;p.x+=xShift}
  return {positions,width:Math.max(900,leaf*210+120),height:rootY+140+shift}
}
export function branchPath(a:Position,b:Position) {return `M ${a.x} ${a.y} C ${a.x} ${a.y-110}, ${b.x} ${b.y+100}, ${b.x} ${b.y}`}
