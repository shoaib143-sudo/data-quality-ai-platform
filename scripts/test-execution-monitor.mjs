import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const dir=mkdtempSync(join(tmpdir(),'living-tree-test-'))
let count=0
try {
  const compile=(source,name,replacements={})=>{
    let code=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to)
    writeFileSync(join(dir,name),code);return import(pathToFileURL(join(dir,name)).href)
  }
  const core=await compile('lib/monitoring/execution-contract.ts','core.mjs')
  const {treeLayout}=await compile('app/monitoring/execution-tree-layout.ts','layout.mjs',{'@/lib/monitoring/execution-contract':'./core.mjs'})
  const {SYNTHETIC_SNAPSHOT,syntheticRun}=await compile('tests/fixtures/execution-monitor/synthetic.ts','fixture.mjs')
  const test=(name,fn)=>{fn();count++;console.log(`PASS synthetic ${count}: ${name}`)}
  const snap=structuredClone(SYNTHETIC_SNAPSHOT),root=snap.runs[0],quality=snap.runs[2],waiting=snap.runs[3]
  test('actual ownership gives root depth zero',()=>assert.equal(core.ownershipDepths(snap.runs,snap.rootId).get(root.id),0))
  test('child ownership gives depth one',()=>assert.equal(core.ownershipDepths(snap.runs,snap.rootId).get(quality.id),1))
  test('running state cyan category',()=>assert.equal(core.displayState(quality,snap),'running'))
  test('recorded success category',()=>assert.equal(core.displayState(snap.runs[1],snap),'complete'))
  test('explicit unmet dependency waits',()=>assert.equal(core.displayState(waiting,snap),'waiting'))
  test('failure overrides dependency',()=>assert.equal(core.displayState({...waiting,status:'FAILED'},snap),'failed'))
  test('cancelled stays distinct',()=>assert.equal(core.displayState({...waiting,status:'CANCELLED'},snap),'cancelled'))
  test('terminal dependency accepts failure',()=>assert.equal(core.dependencySatisfied('FAILED','TERMINAL'),true))
  test('success dependency rejects failure',()=>assert.equal(core.dependencySatisfied('FAILED','SUCCESS'),false))
  test('running never satisfies dependency',()=>assert.equal(core.dependencySatisfied('RUNNING','TERMINAL'),false))
  test('missing scope never fabricates percent',()=>assert.equal(core.runProgress(root.id,snap).percent,null))
  const step={id:'step',agent_run_id:quality.id,step_name:'check',step_order:1,status:'SUCCEEDED',attempt:3,started_at:null,completed_at:null,error_code:null}
  test('successful recorded step does not imply whole plan complete',()=>assert.equal(core.runProgress(quality.id,{...snap,steps:[step]}).percent,null))
  const plan={version:1,runId:quality.id,revision:'synthetic',complete:true,steps:[{id:'a',runId:quality.id,name:'check',order:1,dependsOn:[]},{id:'b',runId:quality.id,name:'publish',order:2,dependsOn:['a']}]}
  test('complete plan produces evidence fraction',()=>assert.equal(core.runProgress(quality.id,{...snap,steps:[step],plans:[plan]}).percent,50))
  test('partial evidence suppresses percentage',()=>assert.equal(core.runProgress(quality.id,{...snap,steps:[step],plans:[plan],truncated:true}).percent,null))
  test('cycle detected',()=>assert.throws(()=>core.ownershipDepths([root,syntheticRun('x','y'),syntheticRun('y','x')],root.id),/Cyclic/))
  test('missing ancestor detected',()=>assert.throws(()=>core.ownershipDepths([root,syntheticRun('x','missing')],root.id),/Incomplete/))
  test('same agent multiple runs remain distinct',()=>assert.equal(treeLayout(snap.runs.map(r=>({...r,agent_definition_id:'same'})),root.id).positions.size,5))
  test('status updates do not move branches',()=>assert.deepEqual(treeLayout(snap.runs,root.id),treeLayout(snap.runs.map(r=>({...r,status:'SUCCEEDED'})),root.id)))
  test('approval pending overrides running animation',()=>assert.equal(core.displayState(quality,{...snap,waits:[{runId:quality.id,reason:'HUMAN_APPROVAL'}]}),'waiting'))
  test('new plan scope changes denominator',()=>assert.equal(core.runProgress(quality.id,{...snap,steps:[step],plans:[{...plan,steps:[...plan.steps,{id:'c',runId:quality.id,name:'finalize',order:3,dependsOn:[]}]}]}).percent,33))
  for(const size of [10,100,1000]){
    const input=[root,...Array.from({length:size-1},(_,i)=>syntheticRun(`load-${i}`,root.id))]
    const start=performance.now();const result=treeLayout(input,root.id)
    assert.equal(result.positions.size,size);console.log(`MEASURE synthetic layout ${size} nodes: ${(performance.now()-start).toFixed(2)} ms`)
  }
  console.log(`${count} synthetic correctness cases passed. No database or production execution exercised.`)
} finally {rmSync(dir,{recursive:true,force:true})}
