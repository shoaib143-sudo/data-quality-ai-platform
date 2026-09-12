import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDatasetVersion, AuthorizationError, hasProjectCapability } from '@/lib/auth/authorize'
import { createClient } from '@/lib/supabase/server'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-policy'

function text(value: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const datasetVersionId = text(url.searchParams.get('datasetVersionId'))

    if (!projectId || !datasetVersionId) {
      return NextResponse.json(
        { error: 'projectId and datasetVersionId are required.', code: 'INVALID_PROFILE_READINESS_REQUEST' },
        { status: 400 },
      )
    }

    const { dataset } = await authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')
    if (dataset.project_id !== projectId) {
      return NextResponse.json(
        { error: 'Dataset version does not belong to the requested project.', code: 'PROFILE_READINESS_PROJECT_MISMATCH' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .schema('catalog')
      .rpc('verify_dataset_version_profile_readiness', {
        p_project_id: projectId,
        p_dataset_version_id: datasetVersionId,
      })

    if (error) {
      throw new Error(`Unable to load profiling readiness: ${error.message}`)
    }

    const landingAccess = await resolveLandingAccess(user.id)
    const canAccessDatasetsWorkspace = canAccessWorkspace(landingAccess.persona, 'datasets', landingAccess.organizationRole)
    const [canManageSource, canUpdateCatalog] = await Promise.all([
      hasProjectCapability(user.id, projectId, 'source.manage'),
      hasProjectCapability(user.id, projectId, 'catalog.update'),
    ])

    const readiness = data && typeof data === 'object' && !Array.isArray(data)
      ? {
          ...data,
          manual_access: {
            source_edit: canAccessDatasetsWorkspace && canManageSource,
            dataset_edit: canAccessDatasetsWorkspace && canUpdateCatalog,
          },
        }
      : data

    return NextResponse.json({ readiness })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: 'PROFILE_READINESS_ACCESS_DENIED' }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load profiling readiness.', code: 'PROFILE_READINESS_LOOKUP_FAILED' },
      { status: 500 },
    )
  }
}
