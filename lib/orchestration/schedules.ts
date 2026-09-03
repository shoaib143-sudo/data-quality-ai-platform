import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob, numericSetting } from '@/lib/orchestration/queue'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'

type ScheduleRow = {
  id: string
  project_id: string
  dataset_version_id: string
  job_type: 'PROFILING' | 'DATA_QUALITY'
  name: string
  enabled: boolean
  timezone: string
  cadence: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'INTERVAL'
  interval_minutes: number | null
  run_hour: number | null
  run_minute: number | null
  day_of_week: number | null
  next_run_at: string
  misfire_policy: 'RUN_ONCE' | 'SKIP' | 'CATCH_UP'
  retry_policy: Record<string, unknown>
  created_by: string | null
}

function computeNext(schedule: ScheduleRow, from: Date) {
  const next = new Date(from)
  if (schedule.cadence === 'HOURLY') {
    next.setUTCMinutes(schedule.run_minute ?? 0, 0, 0)
    next.setUTCHours(next.getUTCHours() + 1)
    return next
  }
  if (schedule.cadence === 'INTERVAL') {
    next.setUTCMinutes(next.getUTCMinutes() + Math.max(1, schedule.interval_minutes ?? 60))
    return next
  }
  if (schedule.cadence === 'DAILY') {
    next.setUTCHours(schedule.run_hour ?? 0, schedule.run_minute ?? 0, 0, 0)
    if (next <= from) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  next.setUTCHours(schedule.run_hour ?? 0, schedule.run_minute ?? 0, 0, 0)
  const targetDay = schedule.day_of_week ?? 1
  let delta = (targetDay - next.getUTCDay() + 7) % 7
  if (delta === 0 && next <= from) delta = 7
  next.setUTCDate(next.getUTCDate() + delta)
  return next
}

async function resolveScheduleActor(projectId: string, createdBy: string | null) {
  const admin = createAdminClient()
  if (createdBy) {
    const { data: project } = await admin.schema('app').from('projects').select('organization_id').eq('id', projectId).maybeSingle()
    if (project) {
      const { data: membership } = await admin.schema('app').from('organization_members').select('user_id').eq('organization_id', project.organization_id).eq('user_id', createdBy).maybeSingle()
      if (membership?.user_id) return membership.user_id
    }
  }
  const { data: project } = await admin.schema('app').from('projects').select('organization_id').eq('id', projectId).maybeSingle()
  if (!project) throw new Error('Scheduled job project was not found.')
  const { data: members, error } = await admin.schema('app').from('organization_members').select('user_id,role').eq('organization_id', project.organization_id).order('created_at').limit(20)
  if (error) throw new Error(`Unable to resolve scheduled job actor: ${error.message}`)
  const member = (members ?? []).find((row) => ['OWNER','ADMIN','MEMBER'].includes(String(row.role)))
  if (!member?.user_id) throw new Error('Scheduled job has no active organization member available for governed execution.')
  return member.user_id
}

async function enqueueProfilingSchedule(schedule: ScheduleRow) {
  const admin = createAdminClient()
  const [{ data: version, error: versionError }, { data: agentDefinition, error: agentError }] = await Promise.all([
    admin.schema('catalog').from('dataset_versions').select('id,dataset_id,status').eq('id', schedule.dataset_version_id).maybeSingle(),
    admin.schema('agent').from('agent_definitions').select('id,agent_key,version').eq('agent_key','profiling_agent').eq('version','2.0').eq('enabled',true).maybeSingle(),
  ])
  if (versionError || !version) throw new Error(`Scheduled profiling dataset version is unavailable: ${versionError?.message ?? 'not found'}`)
  if (String(version.status).toUpperCase() !== 'AVAILABLE') throw new Error('Scheduled profiling dataset version is not AVAILABLE.')
  if (agentError || !agentDefinition) throw new Error('Profiling Agent 2.0 is not enabled.')

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id,data_source_id,source_identifier').eq('id', version.dataset_id).eq('project_id', schedule.project_id).maybeSingle()
  if (datasetError || !dataset) throw new Error(`Scheduled profiling dataset is unavailable: ${datasetError?.message ?? 'not found'}`)
  const { data: source, error: sourceError } = dataset.data_source_id
    ? await admin.schema('catalog').from('data_sources').select('id,project_id,status,source_type,connection_metadata').eq('id', dataset.data_source_id).eq('project_id', schedule.project_id).maybeSingle()
    : { data: null, error: null }
  if (sourceError || !source || String(source.status).toUpperCase() !== 'ACTIVE') throw new Error('Scheduled profiling data source is not ACTIVE.')
  const sourceValidation = await validateDataSourceForProfiling(admin, source, dataset.source_identifier ?? '')
  if (!sourceValidation.valid) throw new Error(`Scheduled profiling preflight failed: ${sourceValidation.errors.join(' ')}`)
  const { data: executionSourceRows, error: executionError } = await admin.schema('profiling').from('dataset_execution_sources').select('id,active').eq('dataset_version_id', version.id).eq('active',true).limit(1)
  if (executionError || !executionSourceRows?.[0]) throw new Error('Scheduled profiling execution source is not active.')

  const userId = await resolveScheduleActor(schedule.project_id, schedule.created_by)
  const requestInput = { projectId: schedule.project_id, datasetVersionId: version.id, agentDefinitionId: agentDefinition.id, scheduled: true, scheduleId: schedule.id }
  const { data: agentRun, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: agentDefinition.id,
    project_id: schedule.project_id,
    dataset_id: dataset.id,
    dataset_version_id: version.id,
    status: 'QUEUED',
    input: requestInput,
  }).select('id').single()
  if (runError || !agentRun) throw new Error(`Unable to create scheduled profiling run: ${runError?.message ?? 'unknown error'}`)

  const { data: profileRun, error: profileError } = await admin.schema('profiling').from('profile_runs').insert({
    dataset_version_id: version.id,
    status: 'RUNNING',
    agent_run_id: agentRun.id,
    engine_name: 'profiling-engine',
    engine_version: '1.1',
    configuration: { execution_mode: 'durable_schedule', schedule_id: schedule.id, source_validation: sourceValidation },
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (profileError || !profileRun) {
    await admin.schema('agent').from('agent_runs').update({ status:'FAILED',error_code:'PROFILE_RUN_CREATION_FAILED',error_message:profileError?.message ?? 'Unable to create profile run',completed_at:new Date().toISOString() }).eq('id',agentRun.id)
    throw new Error(`Unable to create scheduled profile run: ${profileError?.message ?? 'unknown error'}`)
  }

  const maxAttempts = numericSetting(schedule.retry_policy?.max_attempts,3)
  const durable = await enqueueDurableJob({
    projectId: schedule.project_id,
    jobType: 'PROFILING',
    entityId: version.id,
    agentRunId: agentRun.id,
    payload: {
      userId,
      projectId: schedule.project_id,
      datasetVersionId: version.id,
      agentDefinitionId: agentDefinition.id,
      agentVersion: agentDefinition.version,
      agentRunId: agentRun.id,
      profilingRunId: profileRun.id,
      requestInput,
      scheduleId: schedule.id,
    },
    maxAttempts,
  })
  return { agentRunId: agentRun.id, profileRunId: profileRun.id, durableJobId: durable.id }
}

async function enqueueDataQualitySchedule(schedule: ScheduleRow) {
  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id',schedule.dataset_version_id).maybeSingle()
  if (versionError || !version) throw new Error('Scheduled data quality dataset version was not found.')
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',version.dataset_id).eq('project_id',schedule.project_id).maybeSingle()
  if (datasetError || !dataset) throw new Error('Scheduled data quality dataset was not found.')
  const [{ data: profileRun, error: profileError }, { data: agentDefinition, error: agentError }] = await Promise.all([
    admin.schema('profiling').from('profile_runs').select('id').eq('dataset_version_id',version.id).eq('status','COMPLETED').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    admin.schema('agent').from('agent_definitions').select('id,version').eq('agent_key','data_quality_agent').eq('version','1.0').eq('enabled',true).maybeSingle(),
  ])
  if (profileError || !profileRun) throw new Error('Scheduled data quality execution requires a completed profiling run.')
  if (agentError || !agentDefinition) throw new Error('Data Quality Agent 1.0 is not enabled.')
  const userId = await resolveScheduleActor(schedule.project_id, schedule.created_by)

  const { data: agentRun, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: agentDefinition.id,
    project_id: schedule.project_id,
    dataset_id: dataset.id,
    dataset_version_id: version.id,
    status: 'QUEUED',
    input: { datasetVersionId:version.id,profileRunId:profileRun.id,scheduled:true,scheduleId:schedule.id },
  }).select('id').single()
  if (runError || !agentRun) throw new Error(`Unable to create scheduled data quality run: ${runError?.message ?? 'unknown error'}`)
  const maxAttempts = numericSetting(schedule.retry_policy?.max_attempts,3)
  const durable = await enqueueDurableJob({
    projectId: schedule.project_id,
    jobType: 'DATA_QUALITY',
    entityId: version.id,
    agentRunId: agentRun.id,
    payload: { datasetVersionId:version.id,profileRunId:profileRun.id,userId,agentRunId:agentRun.id,scheduleId:schedule.id },
    maxAttempts,
  })
  return { agentRunId:agentRun.id,profileRunId:profileRun.id,durableJobId:durable.id }
}

export async function enqueueDueSchedules(limit = 20) {
  const admin = createAdminClient()
  const now = new Date()
  const { data: rows, error } = await admin.schema('orchestration').from('job_schedules').select('*').eq('enabled',true).lte('next_run_at',now.toISOString()).order('next_run_at').limit(limit)
  if (error) throw new Error(`Unable to load due schedules: ${error.message}`)
  const outcomes: Array<Record<string,unknown>> = []

  for (const schedule of (rows ?? []) as ScheduleRow[]) {
    const scheduledAt = new Date(schedule.next_run_at)
    const missed = scheduledAt.getTime() < now.getTime() - 60_000
    let shouldRun = true
    if (missed && schedule.misfire_policy === 'SKIP') shouldRun = false

    try {
      let execution: Record<string,unknown> | null = null
      if (shouldRun) {
        execution = schedule.job_type === 'PROFILING'
          ? await enqueueProfilingSchedule(schedule)
          : await enqueueDataQualitySchedule(schedule)
      }
      let next = computeNext(schedule, scheduledAt)
      while (next <= now) next = computeNext(schedule,next)
      const { error: updateError } = await admin.schema('orchestration').from('job_schedules').update({
        next_run_at: next.toISOString(),
        last_enqueued_at: shouldRun ? now.toISOString() : schedule.next_run_at,
        updated_at: now.toISOString(),
      }).eq('id',schedule.id)
      if (updateError) throw new Error(`Unable to advance schedule: ${updateError.message}`)
      outcomes.push({ scheduleId:schedule.id,jobType:schedule.job_type,missed,misfirePolicy:schedule.misfire_policy,enqueued:shouldRun,execution,nextRunAt:next.toISOString() })
    } catch (error) {
      outcomes.push({ scheduleId:schedule.id,jobType:schedule.job_type,enqueued:false,error:error instanceof Error?error.message:'Schedule enqueue failed.' })
      if (schedule.misfire_policy !== 'CATCH_UP') {
        const next=computeNext(schedule,now)
        await admin.schema('orchestration').from('job_schedules').update({next_run_at:next.toISOString(),updated_at:now.toISOString()}).eq('id',schedule.id)
      }
    }
  }
  return outcomes
}

export function calculateInitialNextRun(input: {
  cadence: ScheduleRow['cadence']
  intervalMinutes?: number | null
  runHour?: number | null
  runMinute?: number | null
  dayOfWeek?: number | null
}) {
  const now = new Date()
  const schedule = {
    cadence: input.cadence,
    interval_minutes: input.intervalMinutes ?? null,
    run_hour: input.runHour ?? null,
    run_minute: input.runMinute ?? null,
    day_of_week: input.dayOfWeek ?? null,
  } as ScheduleRow
  return computeNext(schedule,now).toISOString()
}
