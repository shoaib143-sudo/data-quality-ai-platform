import { authorizeProject } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export type MonitoringDependencyType = 'SUCCESS' | 'TERMINAL'

export type MonitoringDependencyEvidence = {
  projectId: string
  runId: string
  jobId: string
  jobType: string
  jobStatus: string
  dependencyType: MonitoringDependencyType
  dependsOnJobId: string
  dependsOnRunId: string | null
  dependsOnJobType: string
  dependsOnStatus: string
  satisfied: boolean
}

type MonitoringJobRow = {
  id: string
  project_id: string
  agent_run_id: string | null
  job_type: string
  status: string
}

type MonitoringDependencyRow = {
  project_id: string
  job_id: string
  depends_on_job_id: string
  dependency_type: string
}

const TERMINAL_JOB_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'])

export function isMonitoringDependencySatisfied(dependencyType: MonitoringDependencyType, parentStatus: string) {
  if (dependencyType === 'SUCCESS') return parentStatus === 'SUCCEEDED'
  return TERMINAL_JOB_STATUSES.has(parentStatus)
}

function uniqueBounded(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

export async function loadMonitoringDependencyEvidence(input: {
  userId: string
  projectIds: string[]
  runIds: string[]
}) {
  const projectIds = uniqueBounded(input.projectIds, 25)
  const runIds = uniqueBounded(input.runIds, 50)
  if (!projectIds.length || !runIds.length) return [] satisfies MonitoringDependencyEvidence[]

  await Promise.all(projectIds.map((projectId) => authorizeProject(input.userId, projectId, 'observability.read')))

  const admin = createAdminClient()
  const { data: targetJobsData, error: targetJobsError } = await admin
    .schema('orchestration')
    .from('job_queue')
    .select('id,project_id,agent_run_id,job_type,status')
    .in('project_id', projectIds)
    .in('agent_run_id', runIds)
    .limit(200)
  if (targetJobsError) throw new Error(`Unable to load monitored jobs: ${targetJobsError.message}`)

  const targetJobs = (targetJobsData ?? []) as MonitoringJobRow[]
  const targetJobsById = new Map(targetJobs.map((job) => [job.id, job]))
  const targetJobIds = [...targetJobsById.keys()]
  if (!targetJobIds.length) return [] satisfies MonitoringDependencyEvidence[]

  const { data: dependencyRowsData, error: dependencyRowsError } = await admin
    .schema('orchestration')
    .from('job_dependencies')
    .select('project_id,job_id,depends_on_job_id,dependency_type')
    .in('project_id', projectIds)
    .in('job_id', targetJobIds)
    .limit(500)
  if (dependencyRowsError) throw new Error(`Unable to load monitored job dependencies: ${dependencyRowsError.message}`)

  const dependencyRows = (dependencyRowsData ?? []) as MonitoringDependencyRow[]
  const parentJobIds = [...new Set(dependencyRows.map((row) => row.depends_on_job_id))]
  if (!parentJobIds.length) return [] satisfies MonitoringDependencyEvidence[]

  const { data: parentJobsData, error: parentJobsError } = await admin
    .schema('orchestration')
    .from('job_queue')
    .select('id,project_id,agent_run_id,job_type,status')
    .in('project_id', projectIds)
    .in('id', parentJobIds)
    .limit(500)
  if (parentJobsError) throw new Error(`Unable to load monitored dependency jobs: ${parentJobsError.message}`)

  const parentJobsById = new Map(((parentJobsData ?? []) as MonitoringJobRow[]).map((job) => [job.id, job]))
  const evidence: MonitoringDependencyEvidence[] = []

  for (const dependency of dependencyRows) {
    const job = targetJobsById.get(dependency.job_id)
    const parent = parentJobsById.get(dependency.depends_on_job_id)
    if (!job?.agent_run_id || !parent) continue
    if (job.project_id !== dependency.project_id || parent.project_id !== dependency.project_id) continue
    if (dependency.dependency_type !== 'SUCCESS' && dependency.dependency_type !== 'TERMINAL') continue

    const dependencyType = dependency.dependency_type as MonitoringDependencyType
    evidence.push({
      projectId: dependency.project_id,
      runId: job.agent_run_id,
      jobId: job.id,
      jobType: job.job_type,
      jobStatus: job.status,
      dependencyType,
      dependsOnJobId: parent.id,
      dependsOnRunId: parent.agent_run_id,
      dependsOnJobType: parent.job_type,
      dependsOnStatus: parent.status,
      satisfied: isMonitoringDependencySatisfied(dependencyType, parent.status),
    })
  }

  return evidence
}
