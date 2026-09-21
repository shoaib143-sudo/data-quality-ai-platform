import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dataNexusEnvironment, dataNexusPlatform } from '@/lib/runtime/environment'

export const dynamic = 'force-dynamic'

const RELEASE_SCHEMA_CONTRACT = 'cloudflare-supabase-release-v1'

type CheckResult = {
  status: 'READY' | 'UNAVAILABLE'
}

type AdminClient = ReturnType<typeof createAdminClient>

async function tableCheck(admin: AdminClient, schema: string, table: string, column: string): Promise<CheckResult> {
  const { error } = await admin.schema(schema).from(table).select(column, { head: true }).limit(1)
  return { status: error ? 'UNAVAILABLE' : 'READY' }
}

async function operationalCapabilityCheck(admin: AdminClient): Promise<CheckResult> {
  const expected = new Map<string, string[]>([
    ['DATA_OWNER', ['execution.approve']],
    ['DATA_STEWARD', ['execution.approve']],
    ['DATA_GOVERNANCE_ADMIN', ['execution.approve', 'agent.admin']],
    ['DATA_GOVERNANCE_SPECIALIST', ['execution.approve']],
  ])

  const { data, error } = await admin
    .schema('governance')
    .from('access_roles')
    .select('role_key,capabilities')
    .in('role_key', [...expected.keys()])

  if (error || !data || data.length !== expected.size) return { status: 'UNAVAILABLE' }

  const valid = data.every((row) => {
    const required = expected.get(String(row.role_key))
    const capabilities = Array.isArray(row.capabilities) ? row.capabilities.map(String) : []
    return Boolean(required && required.every((capability) => capabilities.includes(capability)))
  })

  const adminRows = data.filter((row) => {
    const capabilities = Array.isArray(row.capabilities) ? row.capabilities.map(String) : []
    return capabilities.includes('agent.admin')
  })

  return {
    status: valid
      && adminRows.length === 1
      && adminRows[0]?.role_key === 'DATA_GOVERNANCE_ADMIN'
      ? 'READY'
      : 'UNAVAILABLE',
  }
}

export async function GET() {
  if (dataNexusEnvironment() !== 'production' || dataNexusPlatform() !== 'vercel') {
    return NextResponse.json({
      status: 'UNAVAILABLE',
      contract: RELEASE_SCHEMA_CONTRACT,
      reason: 'Release schema authority is only evaluated on the primary Vercel production runtime.',
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const admin = createAdminClient()
  const [
    agentVersionLifecycle,
    providerResilienceProfiles,
    governedLearningCandidates,
    governedLearningReleases,
    positiveLearningCases,
    pgclRunLearningProvenance,
    operationalCapabilities,
    recoveryCrashFencing,
  ] = await Promise.all([
    tableCheck(admin, 'agent', 'agent_version_lifecycle', 'agent_definition_id'),
    tableCheck(admin, 'governance', 'ai_provider_resilience_profile_versions', 'id'),
    tableCheck(admin, 'agent', 'learning_candidates', 'id'),
    tableCheck(admin, 'agent', 'learning_candidate_releases', 'id'),
    tableCheck(admin, 'agent', 'positive_learning_cases', 'review_status'),
    tableCheck(admin, 'agent', 'agent_run_learning_provenance', 'production_eligible'),
    operationalCapabilityCheck(admin),
    tableCheck(admin, 'orchestration', 'recovery_actions', 'execution_token'),
  ])

  const checks = {
    agent_version_lifecycle: agentVersionLifecycle,
    provider_resilience_profiles: providerResilienceProfiles,
    governed_learning_candidates: governedLearningCandidates,
    governed_learning_releases: governedLearningReleases,
    positive_learning_cases: positiveLearningCases,
    pgcl_run_learning_provenance: pgclRunLearningProvenance,
    agent_policy_operational_capabilities: operationalCapabilities,
    recovery_crash_fencing: recoveryCrashFencing,
  }

  const unavailable = Object.values(checks).some((check) => check.status !== 'READY')

  return NextResponse.json({
    status: unavailable ? 'UNAVAILABLE' : 'READY',
    contract: RELEASE_SCHEMA_CONTRACT,
    checks,
    timestamp: new Date().toISOString(),
  }, {
    status: unavailable ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
