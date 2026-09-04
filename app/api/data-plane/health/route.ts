import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { getDataPlaneProviderHealth } from '@/lib/data-plane/provider-health'

export async function GET() {
  try {
    await requireUser()
    const health = await getDataPlaneProviderHealth()
    return NextResponse.json(health, { status: health.healthy ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unable to evaluate data-plane health',
    }, { status: 500 })
  }
}
