import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { personas } from '../lib/governance/personas.ts'
import { canAccessWorkspaceHref } from '../lib/governance/workspace-policy.ts'

const persona = personas['data-steward']
const home = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')
const roleLanding = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')
const autonomyPage = fs.readFileSync('app/agents/autonomous-governance/page.tsx', 'utf8')
const autonomyUi = fs.readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')

test('Data Steward landing language is task and remediation oriented', () => {
  assert.match(persona.strapline, /Investigate|curate|coordinate|improve/i)
  assert.match(persona.primaryQuestion, /attention|investigation|remediation/i)
  assert.equal(persona.nav[0].href, '/home/data-steward')
})

test('Data Steward primary navigation contains only authorized workspace links', () => {
  for (const item of persona.nav) {
    assert.equal(canAccessWorkspaceHref('data-steward', item.href, null), true, item.href)
  }
  const labels = persona.nav.map(item => item.label)
  for (const expected of ['My Tasks','Data Quality','Metadata & Glossary','Classification','Issues']) assert.ok(labels.includes(expected))
})

test('persona landing resolves authenticated access rather than trusting the URL slug alone', () => {
  assert.match(home, /requireUser/)
  assert.match(home, /resolveLandingAccess/)
  assert.match(home, /isPersonaSlug/)
  assert.match(roleLanding, /persona/i)
})

test('autonomous governance UI separates execution authority from policy administration', () => {
  assert.match(autonomyPage, /agent\.execute/)
  assert.match(autonomyPage, /admin\.manage/)
  assert.match(autonomyUi, /canExecute/)
  assert.match(autonomyUi, /canManage/)
  assert.match(autonomyUi, /Read-only policy access/)
  assert.match(autonomyUi, /You do not have agent execution permission/)
})

test('Data Steward can see agents workspace without gaining schedule workspace through navigation', () => {
  assert.equal(canAccessWorkspaceHref('data-steward', '/agents', null), true)
  assert.equal(canAccessWorkspaceHref('data-steward', '/schedules', null), false)
  assert.equal(canAccessWorkspaceHref('data-steward', '/admin', null), false)
})
