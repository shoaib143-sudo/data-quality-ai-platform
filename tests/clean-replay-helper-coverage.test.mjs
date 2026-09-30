import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const scriptsDir = path.resolve('scripts')
const workflow = fs.readFileSync('.github/workflows/native-compensation-post-implementation-assurance.yml', 'utf8')

test('post implementation assurance invokes every clean replay helper', () => {
  const helpers = fs.readdirSync(scriptsDir)
    .filter((name) => /^prepare-clean-.*-replay\.mjs$/.test(name))
    .sort()

  assert.ok(helpers.length > 0, 'expected at least one clean replay helper')
  for (const helper of helpers) {
    assert.ok(workflow.includes(helper), `assurance workflow does not invoke clean replay helper: ${helper}`)
  }
})

test('clean replay helper invocation is unique', () => {
  const helpers = fs.readdirSync(scriptsDir)
    .filter((name) => /^prepare-clean-.*-replay\.mjs$/.test(name))

  for (const helper of helpers) {
    const occurrences = workflow.split(helper).length - 1
    assert.equal(occurrences, 1, `clean replay helper must be invoked exactly once: ${helper}`)
  }
})
