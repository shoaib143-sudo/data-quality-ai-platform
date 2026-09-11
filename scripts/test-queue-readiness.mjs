import assert from 'node:assert/strict'
import { countUnresolvedDeadJobs } from '../lib/observability/queue-readiness.ts'

const at = (minute) => `2026-09-11T05:${String(minute).padStart(2, '0')}:00.000Z`
const job = (overrides = {}) => ({
  project_id: 'project-a',
  job_type: 'GOVERNANCE_AGENT',
  entity_id: 'entity-a',
  completed_at: at(10),
  ...overrides,
})

assert.equal(countUnresolvedDeadJobs([job()], []), 1, 'unrecovered dead job must remain unresolved')
assert.equal(
  countUnresolvedDeadJobs([job()], [job({ completed_at: at(11) })]),
  0,
  'later matching success must supersede a dead attempt',
)
assert.equal(
  countUnresolvedDeadJobs([job()], [job({ completed_at: at(9) })]),
  1,
  'earlier success must not supersede a later dead attempt',
)
assert.equal(
  countUnresolvedDeadJobs([job()], [job({ project_id: 'project-b', completed_at: at(11) })]),
  1,
  'success from another project must not suppress failure',
)
assert.equal(
  countUnresolvedDeadJobs([job()], [job({ job_type: 'PROFILE_RUN', completed_at: at(11) })]),
  1,
  'success from another job type must not suppress failure',
)
assert.equal(
  countUnresolvedDeadJobs([job()], [job({ entity_id: 'entity-b', completed_at: at(11) })]),
  1,
  'success for another entity must not suppress failure',
)
assert.equal(
  countUnresolvedDeadJobs([job({ entity_id: null })], [job({ entity_id: null, completed_at: at(11) })]),
  0,
  'null entity ids must match like SQL IS NOT DISTINCT FROM',
)
assert.equal(
  countUnresolvedDeadJobs([job({ completed_at: null })], [job({ completed_at: at(11) })]),
  1,
  'dead attempts without a valid completion timestamp must fail closed',
)

console.log('Durable queue readiness supersession semantics verified.')
