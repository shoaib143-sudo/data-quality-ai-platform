import { NextResponse } from 'next/server'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { probeSupabasePublicDataApi } from '@/lib/supabase/public-data-api-health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()

  try {
    const { url, publishableKey } = getSupabaseEnv()
    const result = await probeSupabasePublicDataApi({ url, publishableKey })

    if (!result.ok) {
      return NextResponse.json({
        status: 'UNAVAILABLE',
        provider: 'supabase',
        boundary: 'public-data-api',
        httpStatus: result.httpStatus,
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json({
      status: 'READY',
      provider: 'supabase',
      boundary: 'public-data-api',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({
      status: 'UNAVAILABLE',
      provider: 'supabase',
      boundary: 'public-data-api',
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
