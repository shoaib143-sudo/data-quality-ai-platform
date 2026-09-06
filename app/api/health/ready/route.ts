import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type ComponentStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE'

async function checkSemanticEmbeddingProvider(admin: ReturnType<typeof createAdminClient>) {
  const configuredUrl = process.env.GOVERNANCE_EMBEDDING_URL?.trim()
  if (configuredUrl) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${configuredUrl.replace(/\/$/, '')}/health`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) {
        return {
          status: 'DEGRADED' as const,
          detail: `Semantic embedding provider health returned HTTP ${response.status}.`,
        }
      }
      const payload = await response.json().catch(() => null) as { status?: unknown; dimensions?: unknown; model?: unknown } | null
      const healthy = payload?.status === 'ok' && Number(payload?.dimensions) === 384
      return healthy
        ? {
            status: 'READY' as const,
            detail: typeof payload?.model === 'string' ? `Embedding model ${payload.model} is ready.` : 'Embedding provider is ready.',
          }
        : {
            status: 'DEGRADED' as const,
            detail: 'Semantic embedding provider returned an incompatible health contract.',
          }
    } catch {
      return {
        status: 'DEGRADED' as const,
        detail: 'Semantic embedding provider could not be reached.',
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  try {
    const { data, error } = await admin.functions.invoke('governance-embed', { body: { action: 'health' } })
    if (error) throw error
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const healthy = payload.status === 'healthy'
      && payload.model === 'gte-small'
      && Number(payload.dimensions) === 384
    return healthy
      ? { status: 'READY' as const, detail: 'Governed Supabase embedding model gte-small is ready.' }
      : { status: 'DEGRADED' as const, detail: 'Governed Supabase embedding provider returned an incompatible health contract.' }
  } catch {
    return {
      status: 'DEGRADED' as const,
      detail: 'Governed Supabase embedding provider could not be invoked.',
    }
  }
}

async function checkDatabricksConnector(admin: ReturnType<typeof createAdminClient>) {
  try {
    const { data, error } = await admin.functions.invoke('dgp-databricks-connector', { body: { action: 'health' } })
    if (error) throw error
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const drivers = Array.isArray(payload.drivers) ? payload.drivers.map(String) : []
    const lineageProviders = Array.isArray(payload.lineage_provider) ? payload.lineage_provider.map(String) : []
    const healthy = payload.ok === true
      && drivers.includes('databricks')
      && payload.credential_store === 'supabase-vault'
      && payload.metadata_provider === 'unity-catalog-rest'
      && payload.query_provider === 'statement-execution-api'
      && lineageProviders.includes('system.access.table_lineage')
      && lineageProviders.includes('system.access.column_lineage')
    return healthy
      ? { status: 'READY' as const, detail: 'Native Databricks connector is ready with Supabase Vault, Unity Catalog metadata, SQL Statement Execution, and system lineage.' }
      : { status: 'DEGRADED' as const, detail: 'Native Databricks connector returned an incompatible health contract.' }
  } catch {
    return { status: 'DEGRADED' as const, detail: 'Native Databricks connector could not be invoked.' }
  }
}

async function checkJdbcBridge() {
  const configuredUrl = process.env.JDBC_BRIDGE_URL?.trim()
  const configuredToken = process.env.JDBC_BRIDGE_TOKEN?.trim()
  if (!configuredUrl || !configuredToken) {
    return {
      status: 'DEGRADED' as const,
      detail: 'Generic JDBC bridge is not fully configured. Native PostgreSQL and Databricks connectors remain available; other JDBC engines require the bridge.',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${configuredUrl.replace(/\/$/, '')}/health`, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return { status: 'DEGRADED' as const, detail: `JDBC bridge health returned HTTP ${response.status}.` }
    const payload = await response.json().catch(() => null) as { status?: unknown; service?: unknown; supported_engines?: unknown } | null
    const supported = Array.isArray(payload?.supported_engines) ? payload.supported_engines.map(String) : []
    const healthy = payload?.status === 'ok' && payload?.service === 'datanexus-jdbc-bridge'
    return healthy
      ? { status: 'READY' as const, detail: `Generic JDBC bridge is ready with ${supported.length} engine families advertised.` }
      : { status: 'DEGRADED' as const, detail: 'JDBC bridge returned an incompatible health contract.' }
  } catch {
    return { status: 'DEGRADED' as const, detail: 'JDBC bridge could not be reached.' }
  } finally {
    clearTimeout(timeout)
  }
}

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

  components.semantic_embeddings = await checkSemanticEmbeddingProvider(admin)
  components.databricks_connector = await checkDatabricksConnector(admin)
  components.jdbc_bridge = await checkJdbcBridge()

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
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
    const [{ count: deadEvents, error: deadError }, { count: staleEvents, error: staleError }] = await Promise.all([
      admin.schema('orchestration').from('event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'DEAD').gte('processed_at', cutoff),
      admin.schema('orchestration').from('event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'PROCESSING').lt('lease_expires_at', new Date().toISOString()),
    ])
    if (deadError || staleError) throw deadError ?? staleError
    const degraded = (deadEvents ?? 0) > 0 || (staleEvents ?? 0) > 0
    components.outbox = degraded ? { status: 'DEGRADED', detail: 'Recent dead or stale governance events require attention.' } : { status: 'READY' }
  } catch {
    components.outbox = { status: 'DEGRADED', detail: 'Governance event outbox health could not be fully evaluated.' }
  }

  try {
    const { data, error } = await admin.schema('governance').from('platform_contract_check_runs').select('status,completed_at').order('completed_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) components.governance_contracts = { status: 'DEGRADED', detail: 'No platform contract check has completed yet.' }
    else components.governance_contracts = data.status === 'PASSED' ? { status: 'READY' } : { status: 'DEGRADED', detail: 'Latest platform contract check has failures.' }
  } catch {
    components.governance_contracts = { status: 'DEGRADED', detail: 'Platform contract state could not be evaluated.' }
  }

  try {
    const { data, error } = await admin.schema('governance').rpc('verify_database_api_security_posture')
    if (error) throw error
    const valid = Boolean(data && typeof data === 'object' && data.valid === true)
    components.security = valid ? { status: 'READY' } : { status: 'UNAVAILABLE', detail: 'Database API security posture validation failed.' }
    if (!valid) criticalFailure = true
  } catch {
    components.security = { status: 'UNAVAILABLE', detail: 'Database API security posture could not be validated.' }
    criticalFailure = true
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
