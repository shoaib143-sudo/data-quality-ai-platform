import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ status: 'ALIVE', service: 'data-governance-powerhouse', timestamp: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
