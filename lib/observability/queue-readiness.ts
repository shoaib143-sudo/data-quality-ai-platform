export type QueueCompletion = {
  project_id: string
  job_type: string
  entity_id: string | null
  completed_at: string | null
}

function sameExecutionIdentity(left: QueueCompletion, right: QueueCompletion) {
  return left.project_id === right.project_id
    && left.job_type === right.job_type
    && left.entity_id === right.entity_id
}

export function countUnresolvedDeadJobs(deadJobs: QueueCompletion[], successfulJobs: QueueCompletion[]) {
  return deadJobs.filter((dead) => {
    if (!dead.completed_at) return true
    const deadCompletedAt = Date.parse(dead.completed_at)
    if (!Number.isFinite(deadCompletedAt)) return true

    return !successfulJobs.some((recovered) => {
      if (!sameExecutionIdentity(dead, recovered) || !recovered.completed_at) return false
      const recoveredCompletedAt = Date.parse(recovered.completed_at)
      return Number.isFinite(recoveredCompletedAt) && recoveredCompletedAt > deadCompletedAt
    })
  }).length
}
