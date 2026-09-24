import { NextResponse } from 'next/server'
import { getSupabaseEnv } from '@/lib/supabase/env'

export const dynamic = 'force-dynamic'

const SUPABASE_HEALTH_TIMEOUT_MS = 5_000

export async function GET() {
  const startedAt = Date.now()

  try {
    const { url, publishableKey } = getSupabaseEnv()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUPABASE_HEALTH_TIMEOUT_MS)

    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
        method: 'GET',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      })

      if (!response.ok) {
        return NextResponse.json({
          status: 'UNAVAILABLE',
          provider: 'supabase',
          boundary: 'public-api-gateway',
          httpStatus: response.status,
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
        boundary: 'public-api-gateway',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return NextResponse.json({
      status: 'UNAVAILABLE',
      provider: 'supabase',
      boundary: 'public-api-gateway',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
