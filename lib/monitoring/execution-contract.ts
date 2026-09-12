export type Run = {
  id: string; parent_run_id: string | null; project_id: string; agent_definition_id: string
  dataset_id: string | null; status: string; created_at: string; started_at: string | null
  completed_at: string | null; error_code: string | null; name?: string
}
export type Step = { id: string; agent_run_id: string; step_name: string; step_order: number; status: string; attempt: number; started_at: string | null; completed_at: string | null; error_code: string | null }
export type Plan = { version: 1; runId: string; revision: string; complete: boolean; steps: { id: string; runId: string; order: number; name: string; dependsOn: string[] }[] }
export type Edge = { id: string; source: string; target: string; kind: 'dependency' | 'handoff'; condition: 'SUCCESS' | 'TERMINAL'; satisfied: boolean; evidence: string; external?: boolean; sourceJobId?: string; targetJobId?: string }
export type Snapshot = { rootId: string; fetchedAt: string; runs: Run[]; steps: Step[]; edges: Edge[]; plans: Plan[]; waits: { runId: string; reason: string }[]; warnings: string[]; truncated: boolean }
export const SUCCESS = new Set(['SUCCEEDED', 'COMPLETED'])
export const TERMINAL = new Set(['SUCCEEDED', 'COMPLETED', 'FAILED', 'ERROR', 'DEAD', 'CANCELLED', 'TERMINATED', 'SKIPPED'])
export function dependencySatisfied(status: string, condition: Edge['condition']) { return (condition === 'SUCCESS' ? SUCCESS : TERMINAL).has(status) }
export function displayState(run: Run, snapshot: Pick<Snapshot, 'edges' | 'waits'>) {
  if (SUCCESS.has(run.status)) return 'complete'
  if (['CANCELLED', 'TERMINATED'].includes(run.status)) return 'cancelled'
  if (run.status === 'SKIPPED') return 'skipped'
  if (['FAILED', 'ERROR', 'DEAD'].includes(run.status)) return 'failed'
  if (['WAITING', 'WAITING_APPROVAL', 'PAUSED'].includes(run.status) || snapshot.waits.some(w => w.runId === run.id)) return 'waiting'
  if (run.status === 'RUNNING') return 'running'
  if (snapshot.edges.some(e => e.target === run.id && e.kind === 'dependency' && !e.satisfied)) return 'waiting'
  if (['CREATED', 'QUEUED', 'PENDING'].includes(run.status)) return 'queued'
  return 'unknown'
}
export function runProgress(runId: string, snapshot: Snapshot) {
  const plan = snapshot.plans.find(p => p.runId === runId)
  const recorded = snapshot.steps.filter(s => s.agent_run_id === runId)
  const completed = recorded.filter(s => SUCCESS.has(s.status)).length
  if (!plan?.complete || snapshot.truncated) return { completed, total: null, percent: null, label: `${completed} recorded steps complete; total unknown` }
  const done = plan.steps.filter(p => p.runId === runId
    ? recorded.some(s => s.step_order === p.order && s.step_name === p.name && SUCCESS.has(s.status))
    : snapshot.runs.some(r => r.id === p.runId && SUCCESS.has(r.status))).length
  const total = plan.steps.length
  return { completed: done, total, percent: total ? Math.round(done / total * 100) : null, label: `${done} of ${total} planned steps complete` }
}
export function ownershipDepths(runs: Run[], rootId: string) {
  const byId = new Map(runs.map(r => [r.id, r]))
  const depths = new Map<string, number>()
  for (const run of runs) {
    const seen = new Set<string>(); let cursor: Run | undefined = run; let depth = 0
    while (cursor && cursor.id !== rootId) {
      if (seen.has(cursor.id)) throw new Error('Cyclic execution hierarchy')
      seen.add(cursor.id); cursor = byId.get(cursor.parent_run_id ?? ''); depth++
    }
    if (!cursor) throw new Error('Incomplete execution hierarchy')
    depths.set(run.id, depth)
  }
  return depths
}
