import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/persona-workspace-policy.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('Persona Workspace Policy continuously certifies Agent Policy v2 approval lifecycle', () => {
  for (const command of [
    'scripts/verify-agent-policy-v2.mjs',
    'scripts/test-agent-policy-v2-unit.mjs',
    'scripts/audit-agent-policy-v2-adversarial.mjs',
    'scripts/verify-agent-approval-hardening.mjs',
    'scripts/verify-agent-approval-validity.mjs',
    'scripts/audit-agent-approval-validity-adversarial.mjs',
    'scripts/verify-approval-notification-robustness.mjs',
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')))
  }
})

test('repository exposes one consolidated Agent Policy v2 verification command', () => {
  const command = packageJson.scripts['verify:agent-policy-v2']
  assert.equal(typeof command, 'string')
  for (const required of [
    'verify-agent-policy-v2.mjs',
    'test-agent-policy-v2-unit.mjs',
    'audit-agent-policy-v2-adversarial.mjs',
    'verify-agent-approval-hardening.mjs',
    'verify-agent-approval-validity.mjs',
    'audit-agent-approval-validity-adversarial.mjs',
    'verify-approval-notification-robustness.mjs',
  ]) {
    assert.match(command, new RegExp(required.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')))
  }
})
