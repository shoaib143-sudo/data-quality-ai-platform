import assert from 'node:assert/strict'
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const dir = mkdtempSync(join(tmpdir(), 'monitor-evidence-'))
const rows = []
let fail = false
// Model BOTH deployed uniqueness constraints, not only the artifact primary key.
globalThis.monitorEvidenceDb = {schema: () => ({from: () => ({upsert: async row => {
  if (fail) return {error: {message: 'synthetic storage failure'}}
  if (rows.some(r => r.id === row.id)) return {error: null}
  if (rows.some(r => r.agent_run_id === row.agent_run_id && r.artifact_type === row.artifact_type && r.artifact_version === row.artifact_version)) return {error: {message: 'duplicate run/type/version'}}
  rows.push(row); return {error: null}
}})})}
let count = 0
const test = async (name, fn) => {await fn(); console.log(`PASS evidence ${++count}: ${name}`)}
try {
  writeFileSync(join(dir,'stub.mjs'), 'export const createAdminClient=()=>globalThis.monitorEvidenceDb;')
  const code = ts.transpileModule(readFileSync('lib/monitoring/execution-evidence.ts','utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText.replace('@/lib/supabase/admin','./stub.mjs')
  writeFileSync(join(dir,'evidence.mjs'), code)
  const {recordMonitorPlan, recordMonitorAttempt} = await import(pathToFileURL(join(dir,'evidence.mjs')))
  const plan = {version:1,runId:'SYNTHETIC-RUN',revision:'v1',complete:true,steps:[]}
  const step = {id:'SYNTHETIC-STEP',agent_run_id:plan.runId,step_name:'test',step_order:1,attempt:1,status:'FAILED',started_at:null,completed_at:null,error_code:'SYNTHETIC_ERROR'}
  await test('plan recording is idempotent', async () => {await recordMonitorPlan(plan); await recordMonitorPlan(plan); assert.equal(rows.length,1)})
  await test('revised plans coexist under deployed uniqueness', async () => {await recordMonitorPlan({...plan,revision:'v2'}); assert.equal(rows.length,2)})
  await test('multiple attempts coexist under deployed uniqueness', async () => {await recordMonitorAttempt(step); await recordMonitorAttempt({...step,attempt:2}); assert.equal(rows.length,4)})
  await test('different steps have distinct attempt snapshots', async () => {await recordMonitorAttempt({...step,id:'SYNTHETIC-STEP-2'}); assert.equal(rows.length,5)})
  await test('attempt replay does not replace old evidence', async () => {await recordMonitorAttempt(step); assert.equal(rows.length,5); assert.equal(rows[2].payload.status,'FAILED')})
  await test('free text and payload canaries are excluded', async () => {await recordMonitorAttempt({...step,id:'SANITIZED',input:{secret:'SYNTHETIC_CANARY'},output:'SYNTHETIC_CANARY',error_message:'SYNTHETIC_CANARY'}); assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_CANARY'))})
  await test('failed evidence write rejects before caller can reset step', async () => {fail=true; await assert.rejects(recordMonitorAttempt({...step,attempt:3}),/preserve monitoring evidence/); fail=false})
  console.log(`${count} synthetic evidence cases passed. Deployed constraints modeled; no live records written.`)
} finally {rmSync(dir,{recursive:true,force:true}); delete globalThis.monitorEvidenceDb}
