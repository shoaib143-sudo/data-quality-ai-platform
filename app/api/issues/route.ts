import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import {
  assertIssueOwnerBelongsToProjectOrganization,
  assertIssueReferencesBelongToProject,
  IssueReferenceIntegrityError,
} from '@/lib/governance/issue-reference-integrity'

const ISSUE_SEVERITIES = new Set(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof IssueReferenceIntegrityError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  return null
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'issues.manage')

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('governance')
      .from('issues')
      .select('*,issue_comments(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ issues: data ?? [] })
  } catch (error) {
    const response = authorizationResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load issues.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const title = text(body.title)
    if (!projectId || !title) {
      return NextResponse.json({ error: 'projectId and title are required.' }, { status: 400 })
    }

    const severity = text(body.severity).toUpperCase() || 'MEDIUM'
    if (!ISSUE_SEVERITIES.has(severity)) {
      return NextResponse.json({ error: 'Invalid issue severity.', code: 'ISSUE_SEVERITY_INVALID' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'issues.manage')
    await Promise.all([
      assertIssueReferencesBelongToProject({
        projectId,
        datasetId: body.datasetId,
        datasetVersionId: body.datasetVersionId,
        profileRunId: body.profileRunId,
        findingId: body.findingId,
        qualityRuleRunId: body.qualityRuleRunId,
      }),
      assertIssueOwnerBelongsToProjectOrganization(projectId, body.ownerUserId),
    ])

    const admin = createAdminClient()
    const payload = {
      project_id: projectId,
      dataset_id: text(body.datasetId) || null,
      dataset_version_id: text(body.datasetVersionId) || null,
      profile_run_id: text(body.profileRunId) || null,
      finding_id: text(body.findingId) || null,
      quality_rule_run_id: text(body.qualityRuleRunId) || null,
      title,
      description: text(body.description) || null,
      severity,
      status: 'OPEN',
      owner_user_id: text(body.ownerUserId) || null,
      due_at: text(body.dueAt) || null,
      created_by: user.id,
    }

    const { data, error } = await admin
      .schema('governance')
      .from('issues')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      eventType: 'ISSUE_CREATED',
      entityType: 'ISSUE',
      entityId: data.id,
      metadata: { datasetId: payload.dataset_id, severity: payload.severity },
    })
    return NextResponse.json({ issue: data }, { status: 201 })
  } catch (error) {
    const response = authorizationResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create issue.' }, { status: 500 })
  }
}
