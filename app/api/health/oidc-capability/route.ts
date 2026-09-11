import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    vercel_oidc_available: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
