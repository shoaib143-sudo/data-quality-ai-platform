import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { personaAcceptanceTasks } from '../lib/governance/persona-acceptance-tasks.ts'
import { personas } from '../lib/governance/personas.ts'
import { canAccessWorkspace, canAccessWorkspaceHref, workspacesForPersona } from '../lib/governance/workspace-policy.ts'

const steward = 'data-steward'
const tasks = personaAcceptanceTasks[steward]
const workspaces = new Set(workspacesForPersona(steward))

const roleFoundation = fs.readFileSync('supabase/migrations/20260904041500_expand_enterprise_capability_catalog.sql', 'utf8')
const agentExecution = fs.readFileSync('supabase/migrations/20260904190310_add_governed_agent_execution_capability.sql', 'utf8')
const policyV2Reads = fs.readFileSync('supabase/migrations/20260913154500_agent_policy_v2_read_capabilities.sql', 'utf8')
const lifecycleSplit = fs.readFileSync('supabase/migrations/20260913163500_split_execution_lifecycle_capabilities.sql', 'utf8')

function dataStewardCapabilityBlock() {
  const marker = "where role_key='DATA_STEWARD';"
  const end = roleFoundation.indexOf(marker)
  assert.ok(end > 0, 'DATA_STEWARD role capability block must exist')
  const start = roleFoundation.lastIndexOf('update governance.access_roles', end)
  return roleFoundation.slice(start, end + marker.length)
}

test('Data Steward persona definition remains operationally focused', () => {
  assert.equal(personas[steward].title, 'Data Steward')
  assert.match(personas[steward].primaryQuestion, /attention|investigation|remediation/i)
  assert.ok(personas[steward].nav.some(item => item.href === '/stewardship'))
  assert.ok(personas[steward].nav.some(item => item.href === '/data-quality'))
})

test('Data Steward canonical tasks cover stewardship, quality, glossary, classification and issues', () => {
  assert.deepEqual(
    tasks.map(task => task.id).sort(),
    ['classification-review','glossary-curation','quality-followup','steward-issues','stewardship-triage'].sort(),
  )
  assert.ok(tasks.every(task => task.mode === 'MUTATE'))
  for (const task of tasks) assert.equal(canAccessWorkspaceHref(steward, task.route, null), true, task.id)
})

test('Data Steward workspaces allow governed operational work but not platform administration or schedules', () => {
  for (const allowed of ['catalog','discovery','glossary','data-quality','stewardship','issues','lineage','classification','reports','profiling','agents','monitoring']) {
    assert.equal(workspaces.has(allowed), true, `expected workspace: ${allowed}`)
  }
  for (const denied of ['admin','platform','schedules','datasets','retention']) {
    assert.equal(workspaces.has(denied), false, `unexpected workspace: ${denied}`)
  }
  assert.equal(canAccessWorkspace(steward, 'admin', 'MEMBER'), false)
})

test('Data Steward base role carries the operational capabilities required by its real-life tasks', () => {
  const block = dataStewardCapabilityBlock()
  for (const capability of [
    'catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read',
    'profiling.read','profiling.execute','quality.read','quality.execute','observability.read',
    'issues.manage','classification.review','certification.request','certification.review',
    'stewardship.manage','discovery.execute','report.export','audit.read',
  ]) assert.ok(block.includes(`'${capability}'`), `missing Data Steward capability: ${capability}`)
})

test('Data Steward receives governed agent execution but not approval or admin authority', () => {
  assert.match(agentExecution, /where role_key in \('DATA_OWNER','DATA_STEWARD','QUALITY_MANAGER','POLICY_APPROVER'\)/)
  assert.match(agentExecution, /'agent\.execute'/)
  assert.match(policyV2Reads, /\('DATA_STEWARD'\)/)
  for (const capability of ['agent.view','agent.converse','agent.investigate','agent.recommend','execution.view','execution.view_results','execution.view_evidence']) {
    assert.ok(policyV2Reads.includes(`'${capability}'`), `missing read-side agent capability: ${capability}`)
  }
  assert.match(lifecycleSplit, /array\['execution\.retry','execution\.cancel'\]/)
  assert.match(lifecycleSplit, /where 'agent\.execute' = any\(capabilities\)/)

  const base = dataStewardCapabilityBlock()
  for (const forbidden of ['admin.manage','source.manage','schedule.manage','policy.approve','quality.exception.approve','agent.admin','execution.approve']) {
    assert.equal(base.includes(`'${forbidden}'`), false, `Data Steward must not inherit ${forbidden}`)
  }
})

test('Data Steward execution-mode authority is bounded by capability separation', () => {
  // Manual governed tasks: yes, via task-specific capabilities.
  assert.ok(tasks.some(task => task.requiredCapability === 'stewardship.manage'))
  assert.ok(tasks.some(task => task.requiredCapability === 'quality.execute'))

  // Assisted / automated / goal-driven initiation: agent.execute is deliberately granted.
  assert.match(agentExecution, /DATA_STEWARD/)

  // HITL participation is not approval power; no execution.approve grant is introduced by read-capability expansion.
  assert.equal(policyV2Reads.includes("'execution.approve'"), false)

  // System-trigger configuration is not a Data Steward responsibility.
  assert.equal(dataStewardCapabilityBlock().includes("'schedule.manage'"), false)
})
