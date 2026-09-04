import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export const GOVERNANCE_READ_AGENT_KEYS = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const

export type GovernanceReadAgentKey = typeof GOVERNANCE_READ_AGENT_KEYS[number]

const allowedKeys = new Set<string>(GOVERNANCE_READ_AGENT_KEYS)

function countValue(result: { count: number | null }) {
  return Number(result.count ?? 0)
}

function latestScore(scores: Array<{ overall_score: number | string | null }>) {
  const value = scores[0]?.overall_score
  const parsed = value === null || value === undefined ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roleObservations(agentKey: GovernanceReadAgentKey, input: {
  counts: Record<string, number>
  latestQualityScore: number | null
  failedRecentRuns: number
  partialRecentRuns: number
  openIssues: number
  openIncidents: number
  highSeverityIssues: number
  highSeverityIncidents: number
}) {
  const c = input.counts
  if (agentKey === 'steward_agent') {
    return [
      `${c.datasets} datasets are registered and ${c.stewardshipAssignments} stewardship assignments are recorded.`,
      `${c.glossaryTerms} glossary terms and ${c.classificationLabels} classification labels are available.`,
      `${input.openIssues} open governance issues require stewardship attention.`,
    ]
  }
  if (agentKey === 'governance_analyst_agent') {
    return [
      `${input.openIssues} open governance issues and ${input.openIncidents} open observability incidents are present.`,
      input.latestQualityScore === null ? 'No recent quality score is available in the bounded profiling window.' : `The latest available quality score is ${input.latestQualityScore.toFixed(2)}.`,
      `${c.dataContracts} data contracts and ${c.documents} governed documents are registered.`,
    ]
  }
  if (agentKey === 'architect_agent') {
    return [
      `${c.dataSources} data sources feed ${c.datasets} datasets.`,
      `${c.lineageEdges} canonical lineage edges and ${c.dataContracts} data contracts are present.`,
      `${c.profileRuns} profiling runs are recorded for the bounded project version set.`,
    ]
  }
  if (agentKey === 'investigator_agent') {
    return [
      `${input.failedRecentRuns} failed and ${input.partialRecentRuns} partial profiling runs appear in the recent bounded run window.`,
      `${input.highSeverityIssues} high/critical issues and ${input.highSeverityIncidents} high/critical incidents are currently visible.`,
      'Causal conclusions require drill-down into the cited run, issue, incident and lineage evidence.',
    ]
  }
  if (agentKey === 'executive_agent') {
    return [
      input.latestQualityScore === null ? 'Quality health is not assessed in the current bounded window.' : `Latest available project quality score: ${input.latestQualityScore.toFixed(2)}.`,
      `${input.openIssues + input.openIncidents} open governance/observability items are visible, including ${input.highSeverityIssues + input.highSeverityIncidents} high/critical items.`,
      `${c.datasets} datasets, ${c.dataSources} sources and ${c.lineageEdges} lineage edges are governed in this project.`,
    ]
  }
  return [
    `${input.failedRecentRuns} recent profiling failures and ${input.partialRecentRuns} partial runs are visible.`,
    `${input.openIssues} open issues and ${input.openIncidents} open incidents may require operational follow-up.`,
    'Use the referenced run/issue/incident identifiers for deeper troubleshooting; this agent does not modify production state.',
  ]
}

export async function executeGovernanceReadAgent(input: {
  projectId: string
  agentDefinitionId: string
  actorUserId: string
  question?: string | null
}) {
  const admin = createAdminClient()
  const question = input.question?.trim().slice(0, 1000) || null

  const { data: definition, error: definitionError } = await admin
    .schema('agent')
    .from('agent_definitions')
    .select('id,agent_key,name,version,enabled,configuration')
    .eq('id', input.agentDefinitionId)
    .eq('enabled', true)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve agent definition: ${definitionError.message}`)
  if (!definition || !allowedKeys.has(String(definition.agent_key))) throw new Error('Agent definition is not an enabled governed read-only agent.')
  const agentKey = String(definition.agent_key) as GovernanceReadAgentKey

  const now = new Date().toISOString()
  const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: definition.id,
    project_id: input.projectId,
    status: 'RUNNING',
    input: { question, execution_mode: 'deterministic_read_only' },
    started_at: now,
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create governed agent run: ${runError?.message ?? 'unknown error'}`)

  try {
    const [projectResult, datasetsResult, sourcesResult] = await Promise.all([
      admin.schema('app').from('projects').select('id,name,organization_id').eq('id', input.projectId).maybeSingle(),
      admin.schema('catalog').from('datasets').select('id,name,data_source_id').eq('project_id', input.projectId).order('created_at', { ascending: false }).limit(500),
      admin.schema('catalog').from('data_sources').select('id,name,status,source_type,created_at').eq('project_id', input.projectId).order('created_at', { ascending: false }).limit(25),
    ])
    if (projectResult.error || !projectResult.data) throw new Error(`Unable to read project: ${projectResult.error?.message ?? 'not found'}`)
    if (datasetsResult.error) throw new Error(`Unable to read project datasets: ${datasetsResult.error.message}`)
    if (sourcesResult.error) throw new Error(`Unable to read project sources: ${sourcesResult.error.message}`)

    const datasetIds = (datasetsResult.data ?? []).map((row) => row.id)
    const versionResult = datasetIds.length
      ? await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,status,created_at').in('dataset_id', datasetIds).order('created_at', { ascending: false }).limit(1000)
      : { data: [], error: null }
    if (versionResult.error) throw new Error(`Unable to read dataset versions: ${versionResult.error.message}`)
    const versionIds = (versionResult.data ?? []).map((row) => row.id)

    const [
      datasetCount,
      sourceCount,
      glossaryCount,
      classificationCount,
      stewardshipCount,
      lineageCount,
      contractCount,
      documentCount,
      issueCount,
      incidentCount,
      recentIssues,
      recentIncidents,
      profileRunCount,
      recentRuns,
    ] = await Promise.all([
      admin.schema('catalog').from('datasets').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('catalog').from('data_sources').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('glossary_terms').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('classification_labels').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('stewardship_assignments').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('lineage_edges').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('data_contracts').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('documents').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('issues').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('observability_incidents').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId),
      admin.schema('governance').from('issues').select('id,title,status,severity,dataset_id,updated_at').eq('project_id', input.projectId).order('updated_at', { ascending: false }).limit(15),
      admin.schema('governance').from('observability_incidents').select('id,title,status,severity,dataset_id,updated_at').eq('project_id', input.projectId).order('updated_at', { ascending: false }).limit(15),
      versionIds.length ? admin.schema('profiling').from('profile_runs').select('id', { count: 'exact', head: true }).in('dataset_version_id', versionIds) : Promise.resolve({ count: 0, error: null }),
      versionIds.length ? admin.schema('profiling').from('profile_runs').select('id,status,dataset_version_id,started_at,completed_at,error_code,error_message').in('dataset_version_id', versionIds).order('started_at', { ascending: false }).limit(25) : Promise.resolve({ data: [], error: null }),
    ])

    const counted = [datasetCount, sourceCount, glossaryCount, classificationCount, stewardshipCount, lineageCount, contractCount, documentCount, issueCount, incidentCount, profileRunCount]
    const countError = counted.find((result) => result.error)?.error
    if (countError) throw new Error(`Unable to read governed project counts: ${countError.message}`)
    if (recentIssues.error) throw new Error(`Unable to read recent issues: ${recentIssues.error.message}`)
    if (recentIncidents.error) throw new Error(`Unable to read recent incidents: ${recentIncidents.error.message}`)
    if (recentRuns.error) throw new Error(`Unable to read recent profiling runs: ${recentRuns.error.message}`)

    const runIds = (recentRuns.data ?? []).map((row) => row.id)
    const scoreResult = runIds.length
      ? await admin.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,uniqueness_score,validity_score,accuracy_score,created_at').in('profile_run_id', runIds).order('created_at', { ascending: false }).limit(25)
      : { data: [], error: null }
    if (scoreResult.error) throw new Error(`Unable to read recent quality scores: ${scoreResult.error.message}`)

    const counts = {
      datasets: countValue(datasetCount),
      dataSources: countValue(sourceCount),
      glossaryTerms: countValue(glossaryCount),
      classificationLabels: countValue(classificationCount),
      stewardshipAssignments: countValue(stewardshipCount),
      lineageEdges: countValue(lineageCount),
      dataContracts: countValue(contractCount),
      documents: countValue(documentCount),
      issues: countValue(issueCount),
      observabilityIncidents: countValue(incidentCount),
      profileRuns: countValue(profileRunCount),
    }
    const openIssues = (recentIssues.data ?? []).filter((row) => !['RESOLVED','CLOSED','DONE'].includes(String(row.status).toUpperCase())).length
    const openIncidents = (recentIncidents.data ?? []).filter((row) => !['RESOLVED','CLOSED'].includes(String(row.status).toUpperCase())).length
    const highSeverityIssues = (recentIssues.data ?? []).filter((row) => ['HIGH','CRITICAL','SEV1','SEV2'].includes(String(row.severity).toUpperCase())).length
    const highSeverityIncidents = (recentIncidents.data ?? []).filter((row) => ['HIGH','CRITICAL','SEV1','SEV2'].includes(String(row.severity).toUpperCase())).length
    const failedRecentRuns = (recentRuns.data ?? []).filter((row) => String(row.status).toUpperCase() === 'FAILED').length
    const partialRecentRuns = (recentRuns.data ?? []).filter((row) => String(row.status).toUpperCase() === 'PARTIAL').length
    const score = latestScore((scoreResult.data ?? []) as Array<{ overall_score: number | string | null }>)

    const output = {
      agent: { key: agentKey, name: definition.name, version: definition.version },
      question,
      generatedAt: new Date().toISOString(),
      mode: 'deterministic_read_only',
      project: projectResult.data,
      counts,
      health: {
        latestQualityScore: score,
        failedRecentRuns,
        partialRecentRuns,
        openIssues,
        openIncidents,
        highSeverityIssues,
        highSeverityIncidents,
      },
      observations: roleObservations(agentKey, { counts, latestQualityScore: score, failedRecentRuns, partialRecentRuns, openIssues, openIncidents, highSeverityIssues, highSeverityIncidents }),
      recent: {
        sources: sourcesResult.data ?? [],
        issues: recentIssues.data ?? [],
        incidents: recentIncidents.data ?? [],
        profileRuns: recentRuns.data ?? [],
        qualityScores: scoreResult.data ?? [],
      },
      limitations: [
        'This execution is read-only and bounded.',
        'Counts are project scoped; recent collections are intentionally limited.',
        'Recommendations are deterministic observations, not autonomous production changes.',
      ],
    }

    const completedAt = new Date().toISOString()
    const { error: completeError } = await admin.schema('agent').from('agent_runs').update({
      status: 'SUCCEEDED',
      output,
      completed_at: completedAt,
      error_code: null,
      error_message: null,
    }).eq('id', run.id)
    if (completeError) throw new Error(`Unable to persist governed agent output: ${completeError.message}`)

    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      actorType: 'USER',
      eventType: 'GOVERNED_READ_AGENT_COMPLETED',
      entityType: 'AGENT_RUN',
      entityId: run.id,
      metadata: { agent_key: agentKey, agent_version: definition.version, read_only: true, question_supplied: Boolean(question) },
    })

    return { runId: run.id, output }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Governed read agent execution failed.'
    await admin.schema('agent').from('agent_runs').update({
      status: 'FAILED',
      error_code: 'GOVERNED_READ_AGENT_FAILED',
      error_message: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    throw error
  }
}
