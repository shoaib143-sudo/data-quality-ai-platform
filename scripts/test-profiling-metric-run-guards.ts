import assert from 'node:assert/strict'

import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { createAdminClient } from '@/lib/supabase/admin'

const DATASET_VERSION_ID = '10000000-0000-0000-0000-000000000005'
const CANCELLED_RUN_ID = '10000000-0000-0000-0000-000000000018'
const UNKNOWN_RUN_ID = '10000000-0000-0000-0000-000000000019'
const WRONG_DATASET_VERSION_ID = '20000000-0000-0000-0000-000000000005'

const supabase = createAdminClient()

async function createRun(id: string) {
  const { error } = await supabase.schema('profiling').from('profile_runs').insert({
    id,
    dataset_version_id: DATASET_VERSION_ID,
    status: 'RUNNING',
    engine_name: 'deterministic-registry-runtime',
    engine_version: '1.1',
    summary: { synthetic: true, guard_acceptance: true },
  })
  assert.equal(error, null, error?.message)
}

async function assertDatasetVersionOwnershipGuard() {
  await createRun(CANCELLED_RUN_ID)

  await assert.rejects(
    () => executeProfilingMetrics(WRONG_DATASET_VERSION_ID, CANCELLED_RUN_ID, {
      rows: [{ id: 1, email: 'a@example.com', age: 10, note: 'ok' }],
    }),
    new RegExp(`Profiling run ${CANCELLED_RUN_ID} does not belong to dataset version ${WRONG_DATASET_VERSION_ID}`),
  )

  const { data, error } = await supabase.schema('profiling').from('profile_runs')
    .select('status,completed_at').eq('id', CANCELLED_RUN_ID).single()
  assert.equal(error, null, error?.message)
  assert.equal(data?.status, 'RUNNING')
  assert.equal(data?.completed_at, null)
}

async function assertCancelledRunGuard() {
  const { error: cancelError } = await supabase.schema('profiling').from('profile_runs')
    .update({ status: 'CANCELLED' }).eq('id', CANCELLED_RUN_ID)
  assert.equal(cancelError, null, cancelError?.message)

  await assert.rejects(
    () => executeProfilingMetrics(DATASET_VERSION_ID, CANCELLED_RUN_ID, {
      rows: [{ id: 1, email: 'a@example.com', age: 10, note: 'ok' }],
    }),
    new RegExp(`Profiling run ${CANCELLED_RUN_ID} has been cancelled`),
  )

  const { data, error } = await supabase.schema('profiling').from('profile_runs')
    .select('status,completed_at').eq('id', CANCELLED_RUN_ID).single()
  assert.equal(error, null, error?.message)
  assert.equal(data?.status, 'CANCELLED')
  assert.equal(data?.completed_at, null)
}

async function assertUnknownRunGuard() {
  await assert.rejects(
    () => executeProfilingMetrics(DATASET_VERSION_ID, UNKNOWN_RUN_ID, {
      rows: [{ id: 1, email: 'a@example.com', age: 10, note: 'ok' }],
    }),
    new RegExp(`Profiling run ${UNKNOWN_RUN_ID} was not found`),
  )
}

async function main() {
  await assertDatasetVersionOwnershipGuard()
  await assertCancelledRunGuard()
  await assertUnknownRunGuard()
  console.log('Profiling metric runtime guard acceptance passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
