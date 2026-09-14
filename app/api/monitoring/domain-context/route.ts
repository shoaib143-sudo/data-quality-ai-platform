import { NextResponse } from 'next/server'

import { authorizationErrorResponse, authorizeProject } from '@/lib/auth/authorize'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { loadDatasetGovernancePosture } from '@/lib/governance/dataset-governance-posture'
import {
  deriveJobEligibility,
  monitoringPresentationMode,
  workloadPoolForJobType,
  type DependencySnapshot,
} from '@/lib/monitoring/domain-context-policy'
import { loadMonitoringDependencyEvidence } from '@/lib/orchestration/monitoring-dependencies'
import { createAdminClient } from '@/lib/supabase/admin'

type JsonRecord = Record<string, any>

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function upper(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function latestBy(rows: JsonRecord[], key: string, timeKey: string) {
  const latest = new Map<string, JsonRecord>()
  for (const row of rows) {
    const id = String(row[key] ?? '')
    if (!id) continue
    const existing = latest.get(id)
    const nextTime = Date.parse(String(row[timeKey] ?? '')) || 0
    const currentTime = Date.parse(String(existing?.[timeKey] ?? '')) || 0
    if (!existing || nextTime > currentTime) latest.set(id, row)
  }
  return [...latest.values()]
}

function uniqueRows(rows: JsonRecord[]) {
  const result = new Map<string, JsonRecord>()
  for (const row of rows) if (row.id) result.set(String(row.id), row)
  return [...result.values()]
}

function nonEmptyEvidence(value: unknown) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.length > 0
  return Object.keys(value as Record<string, unknown>).length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const runId = url.searchParams.get('runId')?.trim() ?? ''
    const requestedDatasetId = url.searchParams.get('datasetId')?.trim() ?? ''

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!runId && !requestedDatasetId) return NextResponse.json({ error: 'runId or datasetId is required.' }, { status: 400 })

    const authorization = await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()

    const runResult = runId
      ? await admin
        .schema('agent')
        .from('agent_runs')
        .select('id,agent_definition_id,project_id,dataset_id,dataset_version_id,status,created_at,started_at,completed_at,error_code')
        .eq('id', runId)
        .eq('project_id', projectId)
        .maybeSingle()
      : { data: null, error: null }

    if (runResult.error) throw new Error(`Unable to load monitored execution: ${runResult.error.message}`)
    if (runId && !runResult.data) return NextResponse.json({ error: 'Execution was not found in the authorized project.' }, { status: 404 })

    const run = runResult.data as JsonRecord | null
    const runDatasetId = String(run?.dataset_id ?? '')
    if (requestedDatasetId && runDatasetId && requestedDatasetId !== runDatasetId) {
      return NextResponse.json({ error: 'datasetId does not match the recorded execution dataset.' }, { status: 400 })
    }
    const datasetId = requestedDatasetId || runDatasetId
    const datasetVersionId = String(run?.dataset_version_id ?? '')
    const now = new Date()

    const [bindingsResult, capacityResult, runningResult, jobResult, posture, profileResult, qualityDefinitionsResult, qualityRunsResult, lineageAssetsResult, dependencyEvidence] = await Promise.all([
      admin.schema('governance').from('project_role_bindings').select('role_key,active,expires_at').eq('project_id', projectId).eq('user_id', user.id).eq('active', true),
      admin.schema('orchestration').from('capacity_policies').select('max_concurrent_jobs').eq('project_id', projectId).maybeSingle(),
      admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'RUNNING'),
      runId
        ? admin.schema('orchestration').from('job_queue').select('id,job_type,entity_id,agent_run_id,status,priority,attempts,max_attempts,available_at,lease_expires_at,created_at,started_at,completed_at,updated_at').eq('project_id', projectId).eq('agent_run_id', runId).order('created_at')
        : Promise.resolve({ data: [], error: null }),
      datasetId ? loadDatasetGovernancePosture(projectId, datasetId) : Promise.resolve(null),
      datasetVersionId
        ? admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,agent_run_id,status,engine_name,engine_version,row_count,column_count,duplicate_row_count,started_at,completed_at,error_code').eq('dataset_version_id', datasetVersionId).order('started_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      datasetId
        ? admin.schema('profiling').from('quality_rule_definitions').select('id,name,dimension,severity,enabled,approval_status,origin').eq('project_id', projectId).eq('dataset_id', datasetId)
        : Promise.resolve({ data: [], error: null }),
      datasetVersionId
        ? admin.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status,passed,result_state,evidence,started_at,completed_at').eq('dataset_version_id', datasetVersionId).order('completed_at', { ascending: false }).limit(250)
        : Promise.resolve({ data: [], error: null }),
      datasetId
        ? admin.schema('governance').from('lineage_assets').select('id,name,asset_type,dataset_id,last_seen_at,identity_resolution').eq('project_id', projectId).eq('dataset_id', datasetId)
        : Promise.resolve({ data: [], error: null }),
      runId
        ? loadMonitoringDependencyEvidence({ userId: user.id, projectIds: [projectId], runIds: [runId] })
        : Promise.resolve([]),
    ])

    const checkedResults = [
      ['project role bindings', bindingsResult],
      ['capacity policy', capacityResult],
      ['running capacity', runningResult],
      ['durable jobs', jobResult],
      ['profiling state', profileResult],
      ['quality definitions', qualityDefinitionsResult],
      ['quality runs', qualityRunsResult],
      ['lineage assets', lineageAssetsResult],
    ] as const
    for (const [label, result] of checkedResults) if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`)

    const activeRoleKeys = array(bindingsResult.data)
      .filter((binding) => !binding.expires_at || Date.parse(String(binding.expires_at)) > now.getTime())
      .map((binding) => String(binding.role_key ?? ''))
      .filter(Boolean)
    const presentationMode = monitoringPresentationMode(activeRoleKeys, authorization.organizationRole)

    const maxConcurrentJobs = Math.max(1, Number(capacityResult.data?.max_concurrent_jobs ?? 4))
    const runningCount = Number(runningResult.count ?? 0)
    const jobs = array(jobResult.data)

    const dependencyByJob = new Map<string, DependencySnapshot[]>()
    for (const dependency of dependencyEvidence) {
      const snapshot: DependencySnapshot = {
        dependencyType: dependency.dependencyType,
        parentJobId: dependency.dependsOnJobId,
        parentJobType: dependency.dependsOnJobType,
        parentStatus: dependency.dependsOnStatus,
        satisfied: dependency.satisfied,
      }
      dependencyByJob.set(dependency.jobId, [...(dependencyByJob.get(dependency.jobId) ?? []), snapshot])
    }

    const durableJobs = jobs.map((job) => {
      const dependencies = dependencyByJob.get(String(job.id)) ?? []
      const eligibility = deriveJobEligibility({
        status: String(job.status ?? ''),
        attempts: Number(job.attempts ?? 0),
        maxAttempts: Number(job.max_attempts ?? 0),
        availableAt: String(job.available_at ?? ''),
        leaseExpiresAt: job.lease_expires_at ? String(job.lease_expires_at) : null,
      }, dependencies, { runningCount, maxConcurrentJobs }, now.getTime())
      return {
        id: job.id,
        jobType: job.job_type,
        pool: workloadPoolForJobType(String(job.job_type ?? '')),
        recordedStatus: job.status,
        displayState: eligibility.displayState,
        eligible: eligibility.eligible,
        waitingReason: eligibility.waitingReason,
        blockedBy: eligibility.blockedBy,
        leaseHealth: eligibility.leaseHealth,
        attempts: Number(job.attempts ?? 0),
        maxAttempts: Number(job.max_attempts ?? 0),
        priority: job.priority,
        availableAt: job.available_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        updatedAt: job.updated_at,
      }
    })

    const profileRun = profileResult.data ? record(profileResult.data) : null
    const profileFindingResult = profileRun?.id
      ? await admin.schema('profiling').from('profile_findings').select('id,finding_type,severity,title,confidence,created_at').eq('profile_run_id', String(profileRun.id)).order('created_at', { ascending: false }).limit(100)
      : { data: [], error: null }
    if (profileFindingResult.error) throw new Error(`Unable to load profiling findings: ${profileFindingResult.error.message}`)
    const profileFindings = array(profileFindingResult.data)

    const qualityDefinitions = array(qualityDefinitionsResult.data)
    const latestQualityRuns = latestBy(array(qualityRunsResult.data), 'rule_definition_id', 'completed_at')
    const failedQualityRuns = latestQualityRuns.filter((qualityRun) => qualityRun.passed === false || ['FAILED', 'ERROR'].includes(upper(qualityRun.result_state || qualityRun.status)))

    const lineageAssets = array(lineageAssetsResult.data)
    const lineageAssetIds = lineageAssets.map((asset) => String(asset.id)).filter(Boolean)
    const [sourceEdgesResult, targetEdgesResult, impactResult] = lineageAssetIds.length
      ? await Promise.all([
        admin.schema('governance').from('lineage_edges').select('id,source_type,source_id,target_type,target_id,relationship,authority_state,origin,created_at').eq('project_id', projectId).in('source_id', lineageAssetIds),
        admin.schema('governance').from('lineage_edges').select('id,source_type,source_id,target_type,target_id,relationship,authority_state,origin,created_at').eq('project_id', projectId).in('target_id', lineageAssetIds),
        admin.schema('governance').from('lineage_impact_analyses').select('id,root_asset_type,root_asset_id,root_asset_name,trigger_type,direction,affected_count,critical_affected_count,risk_score,confidence,summary,created_at').eq('project_id', projectId).in('root_asset_id', lineageAssetIds).order('created_at', { ascending: false }).limit(10),
      ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
    for (const [label, result] of [['lineage source edges', sourceEdgesResult], ['lineage target edges', targetEdgesResult], ['lineage impact', impactResult]] as const) {
      if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`)
    }
    const lineageEdges = uniqueRows([...array(sourceEdgesResult.data), ...array(targetEdgesResult.data)])
    const impactAnalyses = array(impactResult.data)

    const governanceSummary = posture ? record(posture.summary) : null
    const governanceGaps = posture ? array(posture.gaps).slice(0, 20) : []
    const openIssues = posture ? array(record(posture.issues).open).slice(0, 20).map((issue) => ({
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      status: issue.status,
      dueAt: issue.due_at,
    })) : []
    const authoritativeControls = posture ? array(record(posture.controls).authoritative) : []
    const activeStewards = posture ? array(record(posture.stewardship).active) : []
    const classifications = posture ? array(record(posture.classification).authoritative) : []

    const controlEvidenceCount = authoritativeControls.reduce((total, item) => total + Number(record(item.latestEvaluation).evidence_count ?? 0), 0)
    const qualityEvidenceCount = latestQualityRuns.filter((qualityRun) => nonEmptyEvidence(qualityRun.evidence)).length

    return NextResponse.json({
      capabilities: ['catalog.read', 'observability.read'],
      source: 'RECORDED_STATE_ONLY',
      generatedAt: now.toISOString(),
      presentationMode,
      run,
      dataset: posture?.dataset ?? null,
      truthModel: posture?.truthModel ?? null,
      governance: posture ? {
        summary: governanceSummary,
        gaps: governanceGaps,
        openIssues,
        classification: {
          authoritativeCount: classifications.length,
          proposedCount: array(record(posture.classification).proposed).length,
        },
        stewardship: {
          activeCount: activeStewards.length,
          roles: [...new Set(activeStewards.map((item) => String(item.role ?? '')).filter(Boolean))],
        },
        controls: {
          authoritativeCount: authoritativeControls.length,
          proposedCount: array(record(posture.controls).proposed).length,
          evaluatedCount: authoritativeControls.filter((item) => Boolean(item.latestEvaluation)).length,
          failedCount: authoritativeControls.filter((item) => ['FAIL', 'FAILED', 'NON_COMPLIANT'].includes(upper(record(item.latestEvaluation).effective_result || record(item.latestEvaluation).result))).length,
        },
        contractCount: array(posture.contracts).length,
        certificationReadiness: posture.certificationReadiness ?? null,
      } : null,
      profiling: profileRun ? {
        run: profileRun,
        findingCount: profileFindings.length,
        findingsBySeverity: Object.fromEntries(profileFindings.reduce((counts, finding) => {
          const severity = upper(finding.severity) || 'UNSPECIFIED'
          counts.set(severity, (counts.get(severity) ?? 0) + 1)
          return counts
        }, new Map<string, number>())),
        recentFindings: profileFindings.slice(0, 8),
      } : null,
      quality: {
        definedRuleCount: qualityDefinitions.length,
        enabledRuleCount: qualityDefinitions.filter((rule) => rule.enabled === true).length,
        latestEvaluationCount: latestQualityRuns.length,
        failedEvaluationCount: failedQualityRuns.length,
        evidenceCount: qualityEvidenceCount,
      },
      lineage: {
        assetCount: lineageAssets.length,
        edgeCount: lineageEdges.length,
        upstreamEdgeCount: lineageEdges.filter((edge) => lineageAssetIds.includes(String(edge.target_id))).length,
        downstreamEdgeCount: lineageEdges.filter((edge) => lineageAssetIds.includes(String(edge.source_id))).length,
        latestImpact: impactAnalyses[0] ?? null,
      },
      execution: {
        capacity: {
          runningCount,
          maxConcurrentJobs,
          saturated: runningCount >= maxConcurrentJobs,
        },
        jobs: durableJobs,
        blockedCount: durableJobs.filter((job) => job.displayState === 'BLOCKED').length,
        waitingCount: durableJobs.filter((job) => job.displayState === 'WAITING').length,
        staleLeaseCount: durableJobs.filter((job) => job.leaseHealth === 'STALE' || job.leaseHealth === 'MISSING').length,
      },
      evidence: {
        profileFindingCount: profileFindings.length,
        qualityEvidenceCount,
        controlEvidenceCount,
        totalRecordedEvidence: profileFindings.length + qualityEvidenceCount + controlEvidenceCount,
      },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('[job-monitor-domain-context] recorded context read failed', error)
    return NextResponse.json({ error: 'Unable to load monitored domain context.' }, { status: 500 })
  }
}
