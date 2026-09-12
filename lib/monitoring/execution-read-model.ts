import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProject } from '@/lib/auth/authorize'
import { dependencySatisfied, type Run, type Step, type Plan, type Snapshot, type Edge } from './execution-contract'

export const RUN_FIELDS = 'id,parent_run_id,project_id,agent_definition_id,dataset_id,status,created_at,started_at,completed_at,error_code'
export const STEP_FIELDS = 'id,agent_run_id,step_name,step_order,status,attempt,started_at,completed_at,error_code'
export function assertRunId(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid run identifier') }
function check(error: { message: string } | null) { if (error) throw new Error(error.message) }
function safePlan(value: unknown, ids: Set<string>, owner: string): Plan | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Plan
  if (p.version !== 1 || p.runId !== owner || typeof p.revision !== 'string' || typeof p.complete !== 'boolean' || !Array.isArray(p.steps) || p.steps.length > 1000) return null
  if (new Set(p.steps.map(s => s?.id)).size !== p.steps.length) return null
  if (p.steps.some(s => !s || typeof s.id !== 'string' || typeof s.name !== 'string' || !ids.has(s.runId) || !Number.isInteger(s.order) || !Array.isArray(s.dependsOn) || s.dependsOn.some(d => typeof d !== 'string'))) return null
  if (p.steps.some(s => s.dependsOn.some(id => id === s.id || !p.steps.some(other => other.id === id)))) return null
  return { version: 1, runId: p.runId, revision: p.revision, complete: p.complete, steps: p.steps.map(s => ({ id:s.id,runId:s.runId,order:s.order,name:s.name,dependsOn:s.dependsOn })) }
}
export async function readExecution(userId: string, requestedId: string, limit = 100): Promise<Snapshot> {
  assertRunId(requestedId)
  const db = createAdminClient()
  const { data: requested, error } = await db.schema('agent').from('agent_runs').select(RUN_FIELDS).eq('id', requestedId).maybeSingle()
  check(error); if (!requested) throw new Error('Execution not found')
  await authorizeProject(userId, requested.project_id, 'agent.execute')
  const projectId = requested.project_id
  let root = requested as Run; const seen = new Set<string>()
  while (root.parent_run_id) {
    if (seen.has(root.id) || seen.size >= 64) throw new Error('Invalid execution ancestry')
    seen.add(root.id)
    const parent = await db.schema('agent').from('agent_runs').select(RUN_FIELDS).eq('project_id', projectId).eq('id', root.parent_run_id).maybeSingle()
    check(parent.error); if (!parent.data) throw new Error('Execution ancestry is incomplete')
    root = parent.data as Run
  }
  const runs: Run[] = [root]; let frontier = [root.id]; let truncated = false; let depth = 0
  while (frontier.length && runs.length < limit && depth < 64) {
    depth++
    const remaining = limit - runs.length
    const result = await db.schema('agent').from('agent_runs').select(RUN_FIELDS).eq('project_id', projectId).in('parent_run_id', frontier).order('created_at').order('id').limit(remaining + 1)
    check(result.error)
    const children = (result.data ?? []) as Run[]
    if (children.length > remaining) truncated = true
    const batch = children.slice(0, remaining)
    if (batch.some(r => runs.some(existing => existing.id === r.id))) throw new Error('Cyclic execution hierarchy')
    runs.push(...batch); frontier = batch.map(r => r.id)
  }
  if (frontier.length) truncated = true
  const ids = runs.map(r => r.id); const idSet = new Set(ids)
  const warnings: string[] = []
  const [stepsResult, agentsResult, plansResult, interruptsResult, jobsResult] = await Promise.all([
    db.schema('agent').from('agent_run_steps').select(STEP_FIELDS).in('agent_run_id',ids).order('agent_run_id').order('step_order').limit(1000),
    db.schema('agent').from('agent_definitions').select('id,name').in('id',[...new Set(runs.map(r => r.agent_definition_id))]),
    db.schema('agent').from('agent_artifacts').select('id,agent_run_id,payload').in('agent_run_id',ids).eq('artifact_type','MONITOR_PLAN').order('created_at',{ascending:false}).limit(1000),
    db.schema('agent').from('agent_run_interrupts').select('agent_run_id,interrupt_type').in('agent_run_id',ids).eq('status','PENDING').limit(1000),
    db.schema('orchestration').from('job_queue').select('id,agent_run_id,status').eq('project_id',projectId).in('agent_run_id',ids).limit(1000),
  ])
  check(stepsResult.error); check(agentsResult.error); check(plansResult.error)
  if (interruptsResult.error) warnings.push('Approval and interrupt details unavailable')
  if (jobsResult.error) warnings.push('Scheduler dependency details unavailable')
  if ([stepsResult,plansResult,interruptsResult,jobsResult].some(r => (r.data?.length ?? 0) >= 1000)) { truncated = true; warnings.push('Evidence window reached its limit; progress totals are unavailable') }
  const names = new Map((agentsResult.data ?? []).map(a => [a.id,a.name]))
  for (const run of runs) run.name = names.get(run.agent_definition_id) ?? 'Agent run'
  const plans: Plan[] = []; const edges: Edge[] = []; const planOwners = new Set<string>()
  for (const artifact of plansResult.data ?? []) {
    if (planOwners.has(artifact.agent_run_id)) continue
    planOwners.add(artifact.agent_run_id)
    const plan = safePlan(artifact.payload,idSet,artifact.agent_run_id)
    if (!plan) { warnings.push('Plan metadata incomplete or outside loaded hierarchy'); continue }
    plans.push(plan)
    for (const step of plan.steps) for (const dependencyId of step.dependsOn) {
      const source = plan.steps.find(s => s.id === dependencyId)
      if (!source || source.runId === step.runId) continue
      edges.push({id:`${artifact.id}:${source.id}:${step.id}`,source:source.runId,target:step.runId,kind:'dependency',condition:'SUCCESS',satisfied:dependencySatisfied(runs.find(r=>r.id===source.runId)?.status ?? '', 'SUCCESS'),evidence:artifact.id})
    }
  }
  const jobs = jobsResult.data ?? []
  if (jobs.length) {
    const dependencies = await db.schema('orchestration').from('job_dependencies').select('job_id,depends_on_job_id,dependency_type').eq('project_id',projectId).in('job_id',jobs.map(j=>j.id)).limit(1000)
    if (dependencies.error) warnings.push('Scheduler dependency details unavailable')
    else {
      if ((dependencies.data?.length ?? 0) >= 1000) { truncated = true; warnings.push('Dependency window reached its limit') }
      const depIds = [...new Set((dependencies.data ?? []).map(d=>d.depends_on_job_id))]
      const prerequisite = depIds.length ? await db.schema('orchestration').from('job_queue').select('id,agent_run_id,status').eq('project_id',projectId).in('id',depIds) : { data:[],error:null }
      check(prerequisite.error)
      for (const d of dependencies.data ?? []) {
        const target = jobs.find(j=>j.id===d.job_id); const source = prerequisite.data?.find(j=>j.id===d.depends_on_job_id)
        if (!target?.agent_run_id) continue
        const external = !source?.agent_run_id || !idSet.has(source.agent_run_id)
        if (!external && source?.agent_run_id === target.agent_run_id) { warnings.push('Prerequisite between jobs within the same agent run; inspect scheduler diagnostics'); continue }
        const condition = d.dependency_type === 'TERMINAL' ? 'TERMINAL' : 'SUCCESS'
        edges.push({id:`job:${d.job_id}:${d.depends_on_job_id}`,source:source?.agent_run_id ?? d.depends_on_job_id,target:target.agent_run_id,external,sourceJobId:d.depends_on_job_id,targetJobId:d.job_id,kind:'dependency',condition,satisfied:dependencySatisfied(source?.status ?? '',condition),evidence:`${d.job_id}:${d.depends_on_job_id}`})
      }
    }
  }
  if (truncated) warnings.push('Partial tree or evidence window. Load more runs or inspect branch details.')
  return {rootId:root.id,fetchedAt:new Date().toISOString(),runs,steps:(stepsResult.data ?? []) as Step[],edges,plans,waits:(interruptsResult.data ?? []).map(i=>({runId:i.agent_run_id,reason:i.interrupt_type.replaceAll('_',' ')})),warnings:[...new Set(warnings)],truncated}
}

export async function readExecutionRoots(userId: string, projectId: string, offset = 0, status = '') {
  assertRunId(projectId)
  await authorizeProject(userId, projectId, 'agent.execute')
  let query = createAdminClient().schema('agent').from('agent_runs').select(RUN_FIELDS)
    .eq('project_id', projectId).is('parent_run_id', null)
  const statuses = ['CREATED', 'QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED']
  if (statuses.includes(status)) query = query.eq('status', status)
  const result = await query.order('created_at', {ascending: false}).order('id', {ascending: false}).range(offset, offset + 25)
  check(result.error)
  return {runs: (result.data ?? []).slice(0, 25) as Run[], nextOffset: (result.data?.length ?? 0) > 25 ? offset + 25 : null}
}
