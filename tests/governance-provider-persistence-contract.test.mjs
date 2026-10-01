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
