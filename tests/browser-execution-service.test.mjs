import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGovernedBrowserTask } from '../lib/browser-execution/execution-service.ts'

const request = {
  runId: 'run-1',
  projectId: 'project-1',
  task: 'Verify state',
  startUrl: 'https://example.com/catalog',
  allowedOrigins: ['https://example.com'],
  risk: 'READ_ONLY',
}

test('governed browser service records provider evidence against the run', async () => {
  const audits = []
  const provider = {
    key: 'fake',
    async execute() {
      return { provider: 'fake', sessionId: 'task-1', status: 'SUCCEEDED', liveViewUrl: null, finalUrl: null, summary: null, evidence: [] }
    },
    async cancel() {},
  }
  const result = await executeGovernedBrowserTask({ provider, request, recordAudit: async audit => { audits.push(audit) } })
  assert.equal(result.sessionId, 'task-1')
  assert.equal(audits[0].runId, 'run-1')
  assert.equal(audits[0].projectId, 'project-1')
})

test('governed browser service rejects provider identity substitution', async () => {
  const provider = {
    key: 'expected',
    async execute() {
      return { provider: 'other', sessionId: 'task-1', status: 'SUCCEEDED', liveViewUrl: null, finalUrl: null, summary: null, evidence: [] }
    },
    async cancel() {},
  }
  await assert.rejects(() => executeGovernedBrowserTask({ provider, request }), /identity mismatch/)
})
