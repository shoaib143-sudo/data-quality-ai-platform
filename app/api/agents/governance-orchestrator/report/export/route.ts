import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { getLatestGovernanceOutcomeReport } from '@/lib/orchestration/governance-outcome-report-service'
import { renderGovernanceReportExport, type GovernanceReportExportFormat } from '@/lib/orchestration/governance-report-export'

export const runtime = 'nodejs'

function text(value: string | null) {
  return value?.trim() ?? ''
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const orchestratorRunId = text(url.searchParams.get('orchestratorRunId')) || null
    const format = text(url.searchParams.get('format')).toLowerCase() as GovernanceReportExportFormat

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!['pptx', 'pdf'].includes(format)) return NextResponse.json({ error: 'format must be pptx or pdf.' }, { status: 400 })

    // Exporting creates a portable copy of governed evidence and therefore requires
    // the dedicated report-export capability rather than ordinary read access.
    await authorizeProject(user.id, projectId, 'report.export')

    const stored = await getLatestGovernanceOutcomeReport({ projectId, orchestratorRunId })
    if (!stored) return NextResponse.json({ error: 'No governed outcome report is available for export.' }, { status: 404 })

    const bytes = renderGovernanceReportExport(stored.report, format)
    const mime = format === 'pptx'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/pdf'
    const filename = `datanexus-governance-outcome-${stored.orchestratorRunId}.${format}`

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-DataNexus-Report-Hash': stored.reportHash,
      },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to export governance report.' }, { status: 500 })
  }
}
