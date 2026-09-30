import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql=fs.readFileSync(new URL('../supabase/migrations/20260930030000_unified_readiness.sql',import.meta.url),'utf8')

test('readiness persistence is tenant keyed and versioned',()=>{
 assert.match(sql,/organization_id uuid not null/)
 assert.match(sql,/framework_version text not null/)
 assert.match(sql,/readiness_one_active_cycle/)
})

test('snapshots are append-only by design and actions are proposals',()=>{
 assert.match(sql,/Append-only DN-URA readiness snapshots/)
 assert.match(sql,/Readiness findings become proposals only/)
 assert.doesNotMatch(sql,/create policy .* using \(true\)/i)
})

test('readiness tables have RLS enabled',()=>{
 for(const table of ['readiness_assessments','readiness_evidence','readiness_snapshots','readiness_action_proposals']) assert.match(sql,new RegExp(`alter table governance\\.${table} enable row level security`))
})


test('browser roles cannot mutate readiness persistence and service role access is explicit',()=>{
 for(const table of ['readiness_assessments','readiness_evidence','readiness_snapshots','readiness_action_proposals']) {
   assert.match(sql,new RegExp(`revoke all on governance\\.${table} from public, anon, authenticated`))
 }
 assert.match(sql,/grant select, insert, update, delete on governance\.readiness_assessments to service_role/)
 assert.match(sql,/grant select, insert, update, delete on governance\.readiness_evidence to service_role/)
 assert.match(sql,/grant select, insert on governance\.readiness_snapshots to service_role/)
 assert.match(sql,/grant select, insert, update, delete on governance\.readiness_action_proposals to service_role/)
})

test('snapshot append-only semantics are enforced by the database',()=>{
 assert.match(sql,/function governance\.reject_readiness_snapshot_mutation\(\)/)
 assert.match(sql,/before update or delete on governance\.readiness_snapshots/)
 assert.match(sql,/raise exception 'readiness snapshots are append-only'/)
})
