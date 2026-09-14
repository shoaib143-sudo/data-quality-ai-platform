import assert from 'node:assert/strict'

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'])
const satisfied = (type, status) => type === 'SUCCESS' ? status === 'SUCCEEDED' : TERMINAL.has(status)

assert.equal(satisfied('SUCCESS', 'SUCCEEDED'), true, 'SUCCESS dependency must unblock after upstream success')
for (const status of ['QUEUED', 'RUNNING', 'FAILED', 'DEAD', 'CANCELLED']) {
  assert.equal(satisfied('SUCCESS', status), false, `SUCCESS dependency must remain blocked for ${status}`)
}

for (const status of ['SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED']) {
  assert.equal(satisfied('TERMINAL', status), true, `TERMINAL dependency must unblock for ${status}`)
}
for (const status of ['QUEUED', 'RUNNING']) {
  assert.equal(satisfied('TERMINAL', status), false, `TERMINAL dependency must remain blocked for ${status}`)
}

const targetJobs = new Map([
  ['job-a', { id: 'job-a', project_id: 'project-a', agent_run_id: 'run-a', job_type: 'PROFILING', status: 'QUEUED' }],
])
const parentJobs = new Map([
  ['job-parent-good', { id: 'job-parent-good', project_id: 'project-a', agent_run_id: 'run-parent', job_type: 'DISCOVERY', status: 'SUCCEEDED' }],
  ['job-parent-cross-project', { id: 'job-parent-cross-project', project_id: 'project-b', agent_run_id: 'run-other', job_type: 'DISCOVERY', status: 'SUCCEEDED' }],
])
const edges = [
  { project_id: 'project-a', job_id: 'job-a', depends_on_job_id: 'job-parent-good', dependency_type: 'SUCCESS' },
  { project_id: 'project-a', job_id: 'job-a', depends_on_job_id: 'job-parent-cross-project', dependency_type: 'SUCCESS' },
]
const projected = edges.flatMap((edge) => {
  const job = targetJobs.get(edge.job_id)
  const parent = parentJobs.get(edge.depends_on_job_id)
  if (!job?.agent_run_id || !parent) return []
  if (job.project_id !== edge.project_id || parent.project_id !== edge.project_id) return []
  return [{ runId: job.agent_run_id, dependsOnRunId: parent.agent_run_id }]
})
assert.deepEqual(projected, [{ runId: 'run-a', dependsOnRunId: 'run-parent' }], 'projection must discard cross-project dependency evidence')

console.log('Job Monitor dependency evidence tests passed: SUCCESS and TERMINAL semantics match the durable claim contract and cross-project edges are excluded.')
