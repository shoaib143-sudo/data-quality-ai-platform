import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const contract = fs.readFileSync('lib/agents/governed-learning-case-registry.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260929090000_governed_learning_case_registry.sql', 'utf8')

test('governed case contract supports positive and negative evidence without self-promotion', () => {
  assert.match(contract, /'POSITIVE_CASE', 'NEGATIVE_CASE'/)
  assert.match(contract, /requiresHumanReview: true/)
  assert.match(contract, /mayAutoApply: false/)
  assert.match(contract, /maySelfPromote: false/)
  assert.match(contract, /mayExpandToolAuthority: false/)
  assert.match(contract, /mayChangeMutationBoundary: false/)
})

test('positive and negative cases have opposite outcome requirements', () => {
  assert.match(contract, /positive learning cases require successful execution and verification/)
  assert.match(contract, /negative learning cases require an execution or verification failure/)
})

test('negative case storage is project-scoped and protected by RLS', () => {
  assert.match(migration, /create table if not exists agent\.negative_learning_cases/)
  assert.match(migration, /references agent\.learning_candidates\(id, project_id\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /app_private\.is_project_member\(project_id\)/)
  assert.match(migration, /'POSITIVE_CASE','NEGATIVE_CASE'/)
})

test('negative learning evidence remains non-authoritative', () => {
  assert.match(migration, /never grant action authority or mutate agent permissions/)
})


const commandCenterState = fs.readFileSync('lib/ai/governed-learning-command-center-state.ts', 'utf8')
const learningPage = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')

test('Command Center exposes negative learning cases as a separate governed signal', () => {
  assert.match(commandCenterState, /candidateType: string/)
  assert.match(commandCenterState, /negativeCases:/)
  assert.match(commandCenterState, /candidate_type/)
  assert.match(learningPage, /Negative cases/)
  assert.match(learningPage, /candidate\.candidateType/)
})
