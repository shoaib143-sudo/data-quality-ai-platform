import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifyWorkflowSecurityPosture } from '../scripts/verify-workflow-security-posture.mjs'

const baseline = `name: Credential Scope

on:
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`

async function withWorkflow(source, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-security-'))
  try {
    await writeFile(path.join(root, 'fixture.yml'), source)
    await callback(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('rejects a sensitive credential scoped to an entire job', async () => {
  const source = baseline.replace(
    '    runs-on: ubuntu-latest',
    `    runs-on: ubuntu-latest
    env:
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}`,
  )

  await withWorkflow(source, async root => {
    await assert.rejects(
      verifyWorkflowSecurityPosture(root),
      /Workflow security posture failed/,
    )
  })
})

test('accepts a sensitive credential scoped to one step', async () => {
  const source = baseline.replace(
    '      - run: echo verified',
    `      - env:
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: echo verified`,
  )

  await withWorkflow(source, async root => {
    const result = await verifyWorkflowSecurityPosture(root)
    assert.deepEqual(result.violations, [])
  })
})
