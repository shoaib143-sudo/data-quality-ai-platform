import { createAdminClient } from '@/lib/supabase/admin'

export type AgentRunLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'LIFECYCLE' | 'TOOL' | 'METRIC' | 'DATABASE'

export async function writeAgentRunLog(args: {
  agentRunId: string
  agentRunStepId?: string | null
  level: AgentRunLogLevel
  eventType: string
  message: string
  details?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').from('agent_run_logs').insert({
    agent_run_id: args.agentRunId,
    agent_run_step_id: args.agentRunStepId ?? null,
    level: args.level,
    event_type: args.eventType,
    message: args.message,
    details: args.details ?? {},
  })

  if (error) {
    console.error('[agent-run-log] unable to persist log', error)
  }
}
