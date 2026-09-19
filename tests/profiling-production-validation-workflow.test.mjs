import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workflow = await readFile('.github/workflows/profiling-native-replay.yml', 'utf8')

test('production credentials are never exposed to pull_request jobs', () => {
  assert.match(workflow, /live-production:\n\s+if: github\.event_name != 'pull_request'/)
  const contractBlock = workflow.slice(workflow.indexOf('  verify:'), workflow.indexOf('  live-production:'))
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


test('production validation workflow retriggers on every certification artifact', () => {
  for (const marker of [
    "'package.json'",
    "'scripts/ci-full-quality-gate.sh'",
    "'scripts/test-profiling-request-input.mjs'",
    "'scripts/verify-profiling-scale-certification.mjs'",
    "'scripts/test-profiling-scale-certification.mjs'",
    "'scripts/verify-native-supervisor-tier2-profiling.mjs'",
    "'tests/profiling-production-validation-workflow.test.mjs'",
    "'tests/profiling-production-validation-source.test.mjs'",
  ]) {
    const occurrences = workflow.split(marker).length - 1
    assert.equal(occurrences, 2, `expected push and pull_request triggers for ${marker}`)
  }
})


test('production validation workflow watches all certified runtime surfaces', () => {
  for (const marker of [
    "'app/api/agents/run/route.ts'",
    "'app/api/agents/supervisor/tier2/profiling-snapshot/route.ts'",
    "'lib/agents/runtime/native-supervisor-tier2-profiling.ts'",
    "'infra/profiling/**'",
    "'supabase/migrations/**profile**'",
    "'lib/connectors/**'",
  ]) {
    const occurrences = workflow.split(marker).length - 1
    assert.equal(occurrences, 2, `expected push and pull_request triggers for ${marker}`)
  }
})


test('live validation retains exact-head evidence without exposing it to pull requests', () => {
  assert.ok(workflow.includes('PROFILING_PRODUCTION_VALIDATION_EVIDENCE_PATH'))
  assert.ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'))
  assert.ok(workflow.includes('profiling-production-validation-${{ github.sha }}'))
  const contractBlock = workflow.slice(workflow.indexOf('  verify:'), workflow.indexOf('  live-production:'))
  assert.equal(contractBlock.includes('upload-artifact'), false)
})


test('profiling replay workflow cancels stale pull-request runs', () => {
  assert.ok(workflow.includes('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'))
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"))
})
