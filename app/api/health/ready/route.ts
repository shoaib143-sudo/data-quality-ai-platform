import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type ComponentStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE'

export async function GET() {
  const admin = createAdminClient()
  const components: Record<string, { status: ComponentStatus; detail?: string }> = {}
  let criticalFailure = false

  try {
    const { error } = await admin.schema('app').from('projects').select('id', { count: 'exact', head: true })
    if (error) throw error
    components.database = { status: 'READY' }
  } catch {
    components.database = { status: 'UNAVAILABLE', detail: 'Database connectivity check failed.' }
    criticalFailure = true
  }

  try {
    const { data, error } = await admin.schema('agent').from('agent_definitions').select('agent_key,version,enabled').in('agent_key', ['profiling_agent','data_quality_agent']).eq('enabled', true)
    if (error) throw error
    const keys = new Set((data ?? []).map((row) => `${row.agent_key}:${row.version}`))
    const ready = keys.has('profiling_agent:2.0') && keys.has('data_quality_agent:1.0')
    components.agents = ready ? { status: 'READY' } : { status: 'UNAVAILABLE', detail: 'Required production agents are not both enabled.' }
    if (!ready) criticalFailure = true
  } catch {
    components.agents = { status: 'UNAVAILABLE', detail: 'Agent registry check failed.' }
    criticalFailure = true
  }

  try {
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
    const [{ count: deadJobs, error: jobsError }, { count: staleJobs, error: staleError }] = await Promise.all([
      admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'DEAD').gte('completed_at', cutoff),
      admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'RUNNING').lt('lease_expires_at', new Date().toISOString()),
    ])
    if (jobsError || staleError) throw jobsError ?? staleError
    const degraded = (deadJobs ?? 0) > 0 || (staleJobs ?? 0) > 0
    components.queue = degraded ? { status: 'DEGRADED', detail: 'Recent dead or stale durable jobs require attention.' } : { status: 'READY' }
  } catch {
    components.queue = { status: 'DEGRADED', detail: 'Durable queue health could not be fully evaluated.' }
  }

  try {
    const { data, error } = await admin.schema('governance').from('platform_contract_check_runs').select('status,completed_at').order('completed_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) components.governance_contracts = { status: 'DEGRADED', detail: 'No platform contract check has completed yet.' }
    else components.governance_contracts = data.status === 'PASSED' ? { status: 'READY' } : { status: 'DEGRADED', detail: 'Latest platform contract check has failures.' }
  } catch {
    components.governance_contracts = { status: 'DEGRADED', detail: 'Platform contract state could not be evaluated.' }
  }

  const degraded = Object.values(components).some((component) => component.status === 'DEGRADED')
  return NextResponse.json({
    status: criticalFailure ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY',
    components,
    timestamp: new Date().toISOString(),
  }, {
    status: criticalFailure ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
