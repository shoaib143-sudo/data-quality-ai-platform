import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { getDataQualityRecommendationEffectiveness } from '@/lib/data-quality/recommendation-effectiveness'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function integer(value: unknown, fallback: number) { const parsed=Number(value); return Number.isInteger(parsed)?parsed:fallback }

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const days = integer(url.searchParams.get('days'), 90)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'quality.read')
    const result = await getDataQualityRecommendationEffectiveness({ projectId, days })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Data Quality recommendation effectiveness.' }, { status: 500 })
  }
}
