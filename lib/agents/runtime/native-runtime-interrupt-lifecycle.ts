import { createAdminClient } from '@/lib/supabase/admin'

export type NativeRuntimeInterruptTerminalAction = 'ESCALATED' | 'CANCELLED'

export type NativeRuntimeInterruptTimeoutResult = {
  interruptId: string
  interruptStatus: string
  terminalAction: NativeRuntimeInterruptTerminalAction | null
  runStatus: string
  changed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTimeoutResult(value: unknown): NativeRuntimeInterruptTimeoutResult {
  if (!isRecord(value)) throw new Error('Runtime interrupt timeout processor returned an invalid result')
  const interruptId = String(value.interruptId ?? '')
  const interruptStatus = String(value.interruptStatus ?? '')
  const runStatus = String(value.runStatus ?? '')
  const terminalAction = value.terminalAction === 'ESCALATED' || value.terminalAction === 'CANCELLED'
    ? value.terminalAction
    : null
  if (!interruptId || !interruptStatus || !runStatus) {
    throw new Error('Runtime interrupt timeout processor returned incomplete terminal state')
  }
  return {
    interruptId,
    interruptStatus,
    terminalAction,
    runStatus,
    changed: value.changed === true,
  }
}

export async function processExpiredNativeRuntimeInterrupt(interruptId: string) {
  const normalizedId = interruptId.trim()
  if (!normalizedId) throw new Error('interruptId is required')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('process_expired_runtime_interrupt_internal', {
    p_interrupt_id: normalizedId,
  })
  if (error) throw new Error(`Unable to process expired runtime interrupt: ${error.message}`)
  return normalizeTimeoutResult(data)
}

export async function processDueNativeRuntimeInterrupts(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('interrupt timeout sweep limit must be an integer between 1 and 200')
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_interrupts')
    .select('id')
    .eq('status', 'PENDING')
    .not('expires_at', 'is', null)
    .lte('expires_at', now)
    .order('expires_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Unable to discover expired runtime interrupts: ${error.message}`)

  const results: NativeRuntimeInterruptTimeoutResult[] = []
  const failures: Array<{ interruptId: string; error: string }> = []
  for (const row of data ?? []) {
    const interruptId = String(row.id ?? '')
    if (!interruptId) continue
    try {
      results.push(await processExpiredNativeRuntimeInterrupt(interruptId))
    } catch (processorError) {
      failures.push({
        interruptId,
        error: processorError instanceof Error ? processorError.message : String(processorError),
      })
    }
  }

  return {
    discovered: data?.length ?? 0,
    processed: results.length,
    changed: results.filter((result) => result.changed).length,
    escalated: results.filter((result) => result.terminalAction === 'ESCALATED').length,
    cancelled: results.filter((result) => result.terminalAction === 'CANCELLED').length,
    failed: failures.length,
    results,
    failures,
  }
}
