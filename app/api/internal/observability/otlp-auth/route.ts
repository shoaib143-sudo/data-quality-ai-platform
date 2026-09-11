import { configuredOtlpAuthorizationHeader, otlpAuthorizationMatches } from '@/lib/observability/otlp-ingest-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const expected = configuredOtlpAuthorizationHeader()
  if (!expected) {
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const authorized = otlpAuthorizationMatches(request.headers.get('authorization'), expected)
  return new Response(null, {
    status: authorized ? 204 : 401,
    headers: { 'Cache-Control': 'no-store' },
  })
}
