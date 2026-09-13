import assert from 'node:assert/strict'
import { personaSlugs, personas } from '../lib/governance/personas.ts'
import { personaAcceptanceTasks } from '../lib/governance/persona-acceptance-tasks.ts'
import { canAccessWorkspaceHref } from '../lib/governance/workspace-policy.ts'

const knownCapabilities = new Set([
  'catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read','lineage.manage',
  'profiling.read','profiling.execute','quality.read','quality.manage','quality.execute',
  'quality.exception.approve','observability.read','observability.manage','issues.manage',
  'classification.review','policy.approve','certification.request','certification.review',
  'contract.manage','contract.approve','stewardship.manage','source.manage','schedule.manage',
  'notification.manage','workflow.manage','discovery.execute','capacity.manage','retention.manage',
  'report.export','audit.read','agent.execute',
])

assert.equal(personaSlugs.length, 13, 'Real-life persona acceptance contract must cover exactly 13 personas.')
assert.deepEqual(Object.keys(personaAcceptanceTasks).sort(), [...personaSlugs].sort(), 'Task registry must cover every canonical persona exactly once.')

for (const slug of personaSlugs) {
  const tasks = personaAcceptanceTasks[slug]
  assert.ok(tasks.length >= 4, `${slug} must define at least four meaningful real-life acceptance tasks.`)
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, `${slug} task ids must be unique.`)

  for (const task of tasks) {
    assert.ok(task.label.trim().length > 10, `${slug}/${task.id} must describe a real-life user task.`)
    assert.ok(task.expectedEvidence.trim().length > 10, `${slug}/${task.id} must define expected evidence.`)
    assert.ok(canAccessWorkspaceHref(slug, task.route, null), `${slug}/${task.id} points to a workspace the persona cannot access: ${task.route}`)
    assert.notEqual(task.route, '/admin', `${slug}/${task.id} must not treat organization administration as persona authority.`)

    if (task.mode === 'MUTATE') {
      assert.ok(task.requiredCapability, `${slug}/${task.id} mutation task must declare an explicit capability.`)
    }
    if (task.requiredCapability) {
      assert.ok(knownCapabilities.has(task.requiredCapability), `${slug}/${task.id} uses unknown capability ${task.requiredCapability}.`)
    }
  }

  const nav = personas[slug].nav
  assert.ok(nav.every(item => canAccessWorkspaceHref(slug, item.href, null)), `${slug} canonical navigation must remain workspace-authorized.`)
}

assert.ok(personaAcceptanceTasks['senior-leadership'].every(task => task.mode === 'READ'), 'Senior Leadership task contract must remain read-only.')
assert.ok(personaAcceptanceTasks['business-user'].every(task => task.mode === 'READ'), 'Business User task contract must remain read-only.')
assert.ok(personaAcceptanceTasks['data-governance-admin'].every(task => task.route !== '/admin'), 'Data Governance Admin persona must not inherit organization admin routes.')
assert.ok(personaAcceptanceTasks['data-steward'].some(task => task.requiredCapability === 'stewardship.manage'), 'Data Steward must exercise stewardship authority.')
assert.ok(personaAcceptanceTasks['privacy-security-officer'].some(task => task.requiredCapability === 'policy.approve'), 'Privacy & Security Officer must exercise handling-policy authority.')
assert.ok(personaAcceptanceTasks['data-quality-analyst'].some(task => task.requiredCapability === 'quality.execute'), 'Data Quality Analyst must exercise quality execution authority.')
assert.ok(personaAcceptanceTasks['data-custodian'].some(task => task.requiredCapability === 'source.manage'), 'Data Custodian must exercise source management authority.')
assert.ok(personaAcceptanceTasks['source-system-owner'].some(task => task.requiredCapability === 'source.manage'), 'Source System Owner must exercise upstream source management authority.')

const allTasks = personaSlugs.flatMap(slug => personaAcceptanceTasks[slug].map(task => ({ slug, ...task })))
const mutationCount = allTasks.filter(task => task.mode === 'MUTATE').length
const readCount = allTasks.filter(task => task.mode === 'READ').length

assert.ok(readCount > 0 && mutationCount > 0, 'Acceptance contract must contain both read and governed mutation work.')
console.log(`PASS real-life persona task contract: ${allTasks.length} tasks across ${personaSlugs.length} personas (${readCount} read, ${mutationCount} governed mutation).`)
