import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  try {
    const user = await requireApiUser()
    const { issueId } = await params
    const body = await request.json()
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    if (!comment) {
      return NextResponse.json({ error: 'Comment is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: issue, error: issueError } = await admin
      .schema('governance')
      .from('issues')
      .select('project_id')
      .eq('id', issueId)
      .maybeSingle()
    if (issueError) {
      throw new Error(`Unable to resolve issue authorization context: ${issueError.message}`)
    }
    if (!issue) {
      return NextResponse.json({ error: 'Issue not found.' }, { status: 404 })
    }

    await authorizeProject(user.id, issue.project_id, 'issues.manage')

    const { data, error } = await admin
      .schema('governance')
      .from('issue_comments')
      .insert({ issue_id: issueId, user_id: user.id, comment, evidence: body.evidence ?? {} })
      .select('*')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ comment: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add issue comment.' }, { status: 500 })
  }
}
