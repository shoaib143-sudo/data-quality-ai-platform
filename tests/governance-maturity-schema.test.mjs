import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sql = fs.readFileSync('supabase/migrations/20260929070000_governance_maturity_assessment.sql', 'utf8')

test('maturity assessment persistence preserves separate answer, evidence, and observation truth', () => {
  assert.match(sql, /create table if not exists governance\.maturity_assessments/)
  assert.match(sql, /create table if not exists governance\.maturity_assessment_responses/)
  assert.match(sql, /create table if not exists governance\.maturity_assessment_evidence/)
  assert.match(sql, /create table if not exists governance\.maturity_assessment_observations/)
})

test('multi-respondent answers cannot overwrite another respondent', () => {
  assert.match(sql, /unique \(assessment_id, question_id, respondent_user_id\)/)
})

test('direct browser database access fails closed for maturity evidence', () => {
  for (const table of [
    'maturity_assessments',
    'maturity_assessment_responses',
    'maturity_assessment_evidence',
    'maturity_assessment_observations',
  ]) {
    assert.match(sql, new RegExp('alter table governance\\.' + table + ' enable row level security'))
    assert.match(sql, new RegExp('revoke all on governance\\.' + table + ' from public, anon, authenticated'))
    assert.match(sql, new RegExp('grant select, insert, update, delete on governance\\.' + table + ' to service_role'))
  }
})

test('score persistence is explicitly not regulatory certification', () => {
  assert.match(sql, /not regulatory certification/)
})

test('reassessment cycle creation is atomic and service-role only', () => {
  assert.match(sql, /function governance\.start_maturity_assessment_cycle/)
  assert.match(sql, /update governance\.maturity_assessments[\s\S]*insert into governance\.maturity_assessments/)
  assert.match(sql, /revoke all on function governance\.start_maturity_assessment_cycle\(uuid,text,jsonb,uuid\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function governance\.start_maturity_assessment_cycle\(uuid,text,jsonb,uuid\) to service_role/)
})

test('only one active assessment cycle is allowed per organization and framework version', () => {
  assert.match(sql, /unique index if not exists maturity_assessments_one_active_cycle_idx/)
  assert.match(sql, /where status <> 'ARCHIVED'/)
})


test('reassessment function uses a valid PL/pgSQL dollar-quoted body', () => {
  assert.match(sql, /set search_path = pg_catalog, governance\s+as \$\$\s+declare/)
  assert.match(sql, /end;\s+\$\$;/)
  assert.doesNotMatch(sql, /\sas \$\s*\ndeclare/)
})


test('indexes the evidence response foreign key used during evidence lifecycle operations', () => {
  assert.match(sql, /create index if not exists maturity_evidence_response_idx/)
  assert.match(sql, /on governance\.maturity_assessment_evidence\(response_id\)/)
})
