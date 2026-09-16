import { NextResponse } from 'next/server'
import { requireInternalBearer } from '@/lib/security/internal-bearer'
import {
  applyDataNexusR2CorsPolicy,
  readR2CorsPolicy,
  r2CorsHasWildcardOrigin,
  r2CorsPolicyMatchesDesired,
} from '@/lib/storage/r2-cors'

// requireInternalBearer validates CRON_SECRET using constant-time comparison.
export const dynamic = 'force-dynamic'

function mutationsApproved() {
  return process.env.R2_INFRA_MUTATIONS_APPROVED?.trim().toLowerCase() === 'true'
}

async function currentState() {
  const xml = await readR2CorsPolicy()
  return {
    configured: true,
    matchesDesiredPolicy: r2CorsPolicyMatchesDesired(xml),
    wildcardOriginDetected: r2CorsHasWildcardOrigin(xml),
  }
}

export async function GET(request: Request) {
  if (!requireInternalBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    return NextResponse.json(await currentState(), { status: 200 })
  } catch (error) {
    return NextResponse.json({
      configured: false,
      matchesDesiredPolicy: false,
      error: error instanceof Error ? error.message : 'Unable to read R2 CORS policy.',
    }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (!requireInternalBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  if (!mutationsApproved()) {
    return NextResponse.json({ error: 'R2 infrastructure mutations are not approved.' }, { status: 403 })
  }

  try {
    await applyDataNexusR2CorsPolicy()
    const state = await currentState()
    if (!state.matchesDesiredPolicy) {
      return NextResponse.json({ ...state, applied: false, error: 'R2 CORS policy verification failed after update.' }, { status: 500 })
    }
    return NextResponse.json({ ...state, applied: true }, { status: 200 })
  } catch (error) {
    return NextResponse.json({
      applied: false,
      error: error instanceof Error ? error.message : 'Unable to apply R2 CORS policy.',
    }, { status: 500 })
  }
}
