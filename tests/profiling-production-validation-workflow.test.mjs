import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workflow = await readFile('.github/workflows/profiling-production-validation.yml', 'utf8')

test('production credentials are never exposed to pull_request jobs', () => {
  assert.match(workflow, /live-production:\n\s+if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/)
  const contractBlock = workflow.slice(workflow.indexOf('  contract:'), workflow.indexOf('  live-production:'))
  assert.equal(contractBlock.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(contractBlock.includes('NEXT_PUBLIC_SUPABASE_URL'), false)
})

test('live validation fails closed when production evidence is required', () => {
  assert.match(workflow, /PROFILING_PRODUCTION_VALIDATION_REQUIRED: 'true'/)
  assert.match(workflow, /node scripts\/verify-profiling-production-validation\.mjs/)
})

test('pull requests certify lifecycle, replay, governance insights, and TypeScript', () => {
  for (const marker of [
    'pnpm run verify:profiling-lifecycle',
    'verify-profiling-governance-insights.mjs',
    'verify-profiling-native-replay.mjs',
    'verify-profiling-metric-replay.mjs',
    'verify-profiling-dataset-replay.mjs',
    'test-profiling-request-input.mjs',
    'verify-profiling-scale-certification.mjs',
    'test-profiling-scale-certification.mjs',
    'verify-native-supervisor-tier2-profiling.mjs',
    'pnpm exec tsc --noEmit',
  ]) {
    assert.ok(workflow.includes(marker), `missing workflow certification marker: ${marker}`)
  }
})
