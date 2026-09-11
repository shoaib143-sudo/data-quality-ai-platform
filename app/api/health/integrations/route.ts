import { NextResponse } from 'next/server'
import { checkExternalIntegrationBoundaries } from '@/lib/observability/external-integration-readiness'

export const dynamic = 'force-dynamic'

export async function GET() {
  const components = await checkExternalIntegrationBoundaries()
  const unavailable = Object.values(components).some((component) => component.status === 'UNAVAILABLE')
  const degraded = Object.values(components).some((component) => component.status === 'DEGRADED')

  return NextResponse.json({
    status: unavailable ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY',
    components,
    authority_boundary: 'Connectivity and authentication-boundary evidence only; not governance authority or telemetry evidence.',
    timestamp: new Date().toISOString(),
  }, {
    status: unavailable ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
