import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dataNexusEnvironment, dataNexusPlatform } from '@/lib/runtime/environment'

export const dynamic = 'force-dynamic'

const RELEASE_SCHEMA_CONTRACT = 'cloudflare-supabase-release-v1'

type CheckResult = {
  status: 'READY' | 'UNAVAILABLE'
}

async function tableCheck(schema: string, table: string, column: string): Promise<CheckResult> {
  const admin = createAdminClient()
  const { error } = await admin.schema(schema).from(table).select(column, { head: true, count: 'exact' })
  return { status: error ? 'UNAVAILABLE' : 'READY' }
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

  const checks = {
    agent_version_lifecycle: await tableCheck('agent', 'agent_version_lifecycle', 'agent_definition_id'),
    provider_resilience_profiles: await tableCheck('governance', 'ai_provider_resilience_profile_versions', 'id'),
    governed_learning_candidates: await tableCheck('agent', 'learning_candidates', 'id'),
    governed_learning_releases: await tableCheck('agent', 'learning_candidate_releases', 'id'),
    positive_learning_cases: await tableCheck('agent', 'positive_learning_cases', 'id'),
    recovery_crash_fencing: await tableCheck('orchestration', 'recovery_actions', 'execution_token'),
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
