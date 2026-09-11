import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

type StepOutput = Record<string, unknown>

export type ResumableRunStep = {
  id: string
  attempt: number
  alreadySucceeded: boolean
  output: StepOutput
}

function objectOutput(value: unknown): StepOutput {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as StepOutput
    : {}
}

export async function beginResumableRunStep(admin: AdminClient, input: {
  agentRunId: string
  stepName: string
  stepOrder: number
  input: Record<string, unknown>
}) {
  const { data: existing, error: existingError } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .select('id,status,attempt,output')
    .eq('agent_run_id', input.agentRunId)
    .eq('step_order', input.stepOrder)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to resolve agent run step ${input.stepOrder}: ${existingError.message}`)
  }

  if (existing?.status === 'SUCCEEDED') {
    return {
      id: existing.id,
      attempt: Number(existing.attempt ?? 1),
      alreadySucceeded: true,
      output: objectOutput(existing.output),
    } satisfies ResumableRunStep
  }

  const now = new Date().toISOString()
  if (existing) {
    const attempt = Number(existing.attempt ?? 1) + 1
    const { data: resumed, error: resumeError } = await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        step_name: input.stepName,
        status: 'RUNNING',
        attempt,
        input: input.input,
        output: null,
        error_code: null,
        error_message: null,
        started_at: now,
        completed_at: null,
      })
      .eq('id', existing.id)
      .select('id,status,attempt,output')
      .single()

    if (resumeError || !resumed) {
      throw new Error(`Unable to resume agent run step ${input.stepOrder}: ${resumeError?.message ?? 'unknown error'}`)
    }

    return {
      id: resumed.id,
      attempt: Number(resumed.attempt ?? attempt),
      alreadySucceeded: false,
      output: objectOutput(resumed.output),
    } satisfies ResumableRunStep
  }

  const { data: created, error: createError } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .insert({
      agent_run_id: input.agentRunId,
      step_name: input.stepName,
      step_order: input.stepOrder,
      status: 'RUNNING',
      attempt: 1,
      input: input.input,
      started_at: now,
    })
    .select('id,status,attempt,output')
    .single()

  if (createError || !created) {
    throw new Error(`Unable to create agent run step ${input.stepOrder}: ${createError?.message ?? 'unknown error'}`)
  }

  return {
    id: created.id,
    attempt: Number(created.attempt ?? 1),
    alreadySucceeded: false,
    output: objectOutput(created.output),
  } satisfies ResumableRunStep
}
