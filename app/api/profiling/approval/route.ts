import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const profileRunId = text(body.profileRunId)
    const workflowKey = (text(body.workflowKey) || 'PROFILING_REMEDIATION_APPROVAL')
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')

    if (!profileRunId) {
      return NextResponse.json({ error: 'profileRunId is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: profileRun, error: runError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,dataset_version_id,status,summary')
      .eq('id', profileRunId)
      .maybeSingle()

    if (runError) {
      throw new Error(`Unable to load profiling run: ${runError.message}`)
    }
    if (!profileRun) {
      return NextResponse.json({ error: 'Profiling run not found.' }, { status: 404 })
    }
    if (profileRun.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed profiling runs can enter approval.' }, { status: 409 })
    }

    const summary = object(profileRun.summary)
    const investigation = object(summary.investigation)
    if (investigation.approval_required !== true) {
      return NextResponse.json({ error: 'This profiling investigation does not require approval.' }, { status: 409 })
    }

    const { data: datasetVersion, error: versionError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id')
      .eq('id', profileRun.dataset_version_id)
      .maybeSingle()

    if (versionError) {
      throw new Error(`Unable to resolve dataset version: ${versionError.message}`)
    }
    if (!datasetVersion) {
      return NextResponse.json({ error: 'Dataset version for profiling run not found.' }, { status: 409 })
    }

    const { data: dataset, error: datasetError } = await admin
      .schema('catalog')
      .from('datasets')
      .select('id,project_id,name')
      .eq('id', datasetVersion.dataset_id)
      .maybeSingle()

    if (datasetError) {
      throw new Error(`Unable to resolve dataset: ${datasetError.message}`)
    }
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset for profiling run not found.' }, { status: 409 })
    }

    await authorizeProject(user.id, dataset.project_id, 'workflow.manage')

    const { data: definition, error: definitionError } = await admin
      .schema('governance')
      .from('workflow_definitions')
      .select('id,project_id,workflow_key,entity_type,version,enabled')
      .eq('project_id', dataset.project_id)
      .eq('workflow_key', workflowKey)
      .eq('entity_type', 'PROFILE_RUN')
      .eq('enabled', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (definitionError) {
      throw new Error(`Unable to resolve profiling approval workflow: ${definitionError.message}`)
    }
    if (!definition) {
      return NextResponse.json({
        error: `No enabled ${workflowKey} workflow is configured for PROFILE_RUN.`,
        workflowKey,
      }, { status: 409 })
    }

    const { data: existing, error: existingError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,status,current_step,workflow_definition_id')
      .eq('workflow_definition_id', definition.id)
      .eq('entity_type', 'PROFILE_RUN')
      .eq('entity_id', profileRun.id)
      .in('status', ['RUNNING', 'APPROVED'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      throw new Error(`Unable to check existing profiling approval: ${existingError.message}`)
    }
    if (existing) {
      return NextResponse.json({
        instanceId: existing.id,
        status: existing.status,
        currentStep: existing.current_step,
        reused: true,
      })
    }

    const recommendations = Array.isArray(investigation.recommendations)
      ? investigation.recommendations
      : []

    const approvalRecommendations = recommendations.filter((item) => {
      const recommendation = object(item)
      return recommendation.approval_required === true
    })

    const context = {
      source: 'PROFILING_INVESTIGATION',
      profile_run_id: profileRun.id,
      dataset_id: dataset.id,
      dataset_version_id: datasetVersion.id,
      dataset_name: dataset.name,
      investigation_risk: investigation.risk ?? null,
      investigation_confidence: investigation.confidence ?? null,
      business_issue: investigation.business_issue ?? null,
      business_impact: investigation.business_impact ?? null,
      recommendations: approvalRecommendations,
      evidence: Array.isArray(investigation.evidence) ? investigation.evidence : [],
    }

    const { data: instanceId, error: startError } = await admin
      .schema('governance')
      .rpc('start_workflow', {
        p_definition_id: definition.id,
        p_entity_type: 'PROFILE_RUN',
        p_entity_id: profileRun.id,
        p_started_by: user.id,
        p_context: context,
      })

    if (startError || !instanceId) {
      throw new Error(`Unable to start profiling approval workflow: ${startError?.message ?? 'unknown error'}`)
    }

    await writeGovernanceAudit({
      projectId: dataset.project_id,
      actorUserId: user.id,
      eventType: 'PROFILING_APPROVAL_STARTED',
      entityType: 'PROFILE_RUN',
      entityId: profileRun.id,
      metadata: {
        workflow_instance_id: instanceId,
        workflow_definition_id: definition.id,
        workflow_key: definition.workflow_key,
        workflow_version: definition.version,
        dataset_id: dataset.id,
        dataset_version_id: datasetVersion.id,
        recommendation_count: approvalRecommendations.length,
      },
    })

    return NextResponse.json({
      instanceId,
      status: 'RUNNING',
      workflowKey: definition.workflow_key,
      workflowVersion: definition.version,
      reused: false,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to start profiling approval.',
    }, { status: 500 })
  }
}
