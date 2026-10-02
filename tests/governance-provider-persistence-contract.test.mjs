import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { governancePlanApprovalParameters,assertGovernancePlanApprovalBinding } from '../lib/governance-platform/execution/approval-binding.ts'

test('approval binding invalidates plan, plan fingerprint, or desired-state changes',()=>{
 const current={planId:'p1',planFingerprint:'pf1',desiredStateFingerprint:'f1'}
 const parameters=governancePlanApprovalParameters(current)
 assert.doesNotThrow(()=>assertGovernancePlanApprovalBinding(parameters,current))
 assert.throws(()=>assertGovernancePlanApprovalBinding(parameters,{...current,planId:'p2'}),/does not match/)
 assert.throws(()=>assertGovernancePlanApprovalBinding(parameters,{...current,planFingerprint:'pf2'}),/execution plan changed/)
 assert.throws(()=>assertGovernancePlanApprovalBinding(parameters,{...current,desiredStateFingerprint:'f2'}),/desired state changed/)
})

test('durable governance execution tables are service-role only and RLS protected',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261001090000_governance_platform_execution_evidence.sql',import.meta.url),'utf8')
 for(const table of ['platform_execution_checkpoints','platform_execution_evidence']){
  assert.match(sql,new RegExp(`alter table governance\\.${table} enable row level security`))
  assert.match(sql,new RegExp(`revoke all on governance\\.${table} from public, anon, authenticated`))
 }
 assert.match(sql,/unique \(project_id, idempotency_key\)/)
 assert.doesNotMatch(sql,/grant (?:select, )?(?:insert, )?(?:update, )?delete on governance\.platform_execution_evidence to service_role/i)
})


test('deployment evidence schema matches the runtime store and is database-immutable',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261002111500_governance_platform_deployment_evidence_contract.sql',import.meta.url),'utf8')
 const store=fs.readFileSync(new URL('../lib/governance-platform/execution/supabase-store.ts',import.meta.url),'utf8')
 assert.match(store,/deployment_id:record\.deploymentId/)
 assert.match(store,/\.eq\('deployment_id',deploymentId\)/)
 assert.match(sql,/add column if not exists deployment_id text/)
 assert.match(sql,/alter column deployment_id set not null/)
 assert.match(sql,/platform_execution_evidence_deployment_idx/)
 assert.match(sql,/platform_execution_evidence_immutable/)
 assert.match(sql,/before update or delete/)
 assert.match(sql,/claim_platform_execution_checkpoint/)
 assert.match(sql,/for update/)
 assert.match(sql,/resume_action', 'WAIT'/)
 assert.match(sql,/grant execute on function governance\.claim_platform_execution_checkpoint/)
 assert.match(sql,/claim_generation bigint not null default 0/)
 assert.match(sql,/claim_generation = claim_generation \+ 1/)
 assert.match(sql,/put_platform_execution_checkpoint/)
 assert.match(sql,/GOVERNANCE_CHECKPOINT_FENCED/)
 assert.match(sql,/and claim_generation = p_claim_generation/)
 assert.match(sql,/revoke update on governance\.platform_execution_checkpoints from service_role/)
})
