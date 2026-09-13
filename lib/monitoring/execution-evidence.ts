import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Plan, Step } from './execution-contract'

// Existing artifact storage, no new execution authority or schema dependency.
async function record(runId: string, kind: string, key: string, payload: unknown) {
  const digest = createHash('sha256').update(`${runId}:${kind}:${key}`).digest('hex')
  const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`
  const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const { error } = await createAdminClient().schema('agent').from('agent_artifacts').upsert({
    id, agent_run_id: runId, artifact_type: kind, artifact_version: `1.${digest}`, name: kind,
    payload, content_hash: `sha256:${contentHash}`,
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to preserve monitoring evidence: ${error.message}`)
}
export function recordMonitorPlan(plan: Plan) { return record(plan.runId, 'MONITOR_PLAN', plan.revision, plan) }
export function recordMonitorAttempt(step: Step) {
  // No input/output or free-text errors. Snapshot is preserved BEFORE the existing row is reset.
  return record(step.agent_run_id, 'MONITOR_ATTEMPT', `${step.id}:${step.attempt}`, {
    id: step.id, agent_run_id: step.agent_run_id, step_name: step.step_name, step_order: step.step_order,
    attempt: step.attempt, status: step.status, started_at: step.started_at,
    completed_at: step.completed_at, error_code: step.error_code,
  })
}
