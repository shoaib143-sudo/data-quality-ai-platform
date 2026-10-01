import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { governancePlanApprovalParameters,assertGovernancePlanApprovalBinding } from '../lib/governance-platform/execution/approval-binding.ts'

test('approval binding invalidates plan or desired-state changes',()=>{
 const parameters=governancePlanApprovalParameters({planId:'p1',desiredStateFingerprint:'f1'})
 assert.doesNotThrow(()=>assertGovernancePlanApprovalBinding(parameters,{planId:'p1',desiredStateFingerprint:'f1'}))
 assert.throws(()=>assertGovernancePlanApprovalBinding(parameters,{planId:'p2',desiredStateFingerprint:'f1'}),/does not match/)
 assert.throws(()=>assertGovernancePlanApprovalBinding(parameters,{planId:'p1',desiredStateFingerprint:'f2'}),/invalidated/)
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
