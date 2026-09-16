import { NextResponse } from 'next/server'
import { requireInternalBearer } from '@/lib/security/internal-bearer'
import {
  DATANEXUS_R2_CORS_RULES,
  applyDataNexusR2CorsPolicy,
  readR2CorsPolicy,
} from '@/lib/storage/r2-cors'

// requireInternalBearer validates CRON_SECRET using constant-time comparison.
export const dynamic = 'force-dynamic'

function mutationsApproved() {
  return process.env.R2_INFRA_MUTATIONS_APPROVED?.trim().toLowerCase() === 'true'
}

function hasTag(xml: string, tag: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${tag}>\\s*${escaped}\\s*</${tag}>`, 'i').test(xml)
}

function matchesDesiredPolicy(xml: string) {
  if (hasTag(xml, 'AllowedOrigin', '*')) return false
  return DATANEXUS_R2_CORS_RULES.every((rule) =>
    rule.allowedOrigins.every((value) => hasTag(xml, 'AllowedOrigin', value))
    && rule.allowedMethods.every((value) => hasTag(xml, 'AllowedMethod', value))
    && rule.allowedHeaders.every((value) => hasTag(xml, 'AllowedHeader', value))
    && rule.exposeHeaders.every((value) => hasTag(xml, 'ExposeHeader', value))
    && hasTag(xml, 'MaxAgeSeconds', String(rule.maxAgeSeconds)),
  )
}

async function currentState() {
  const xml = await readR2CorsPolicy()
  return {
    configured: true,
    matchesDesiredPolicy: matchesDesiredPolicy(xml),
    wildcardOriginDetected: hasTag(xml, 'AllowedOrigin', '*'),
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
