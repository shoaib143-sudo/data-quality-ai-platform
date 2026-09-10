import { createAdminClient } from '@/lib/supabase/admin'

type JsonRecord = Record<string, any>

const CANONICAL_RESULT_STATES = ['PASS', 'FAIL', 'NOT_MEASURED', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE', 'WAIVED'] as const

type CanonicalResultState = (typeof CANONICAL_RESULT_STATES)[number]

function upper(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase() : ''
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function isCanonicalResultState(value: unknown): value is CanonicalResultState {
  return typeof value === 'string' && (CANONICAL_RESULT_STATES as readonly string[]).includes(value)
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : []
}

function hasValidWaiver(exception: JsonRecord, now: number) {
  if (!['APPROVED', 'WAIVED'].includes(upper(exception.status))) return false
  if (!exception.approved_by || !exception.approved_at) return false
  if (!exception.expires_at) return true
  const expiry = Date.parse(String(exception.expires_at))
  return Number.isFinite(expiry) && expiry > now
}

export async function loadDataQualityIncidentPosture(projectId: string, qualityRuleRunId: string) {
  if (!projectId.trim()) throw new Error('projectId is required')
  if (!qualityRuleRunId.trim()) throw new Error('qualityRuleRunId is required')

  const admin = createAdminClient()
  const runResult = await admin.schema('profiling').from('quality_rule_runs').select('*').eq('id', qualityRuleRunId).maybeSingle()
  if (runResult.error) throw new Error(`Unable to load quality rule run: ${runResult.error.message}`)
  if (!runResult.data) throw new Error('Quality rule run was not found in the authorized project.')

  const definitionResult = await admin
    .schema('profiling')
    .from('quality_rule_definitions')
    .select('*')
    .eq('id', runResult.data.rule_definition_id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (definitionResult.error) throw new Error(`Unable to load quality rule definition: ${definitionResult.error.message}`)
  if (!definitionResult.data) throw new Error('Quality rule run was not found in the authorized project.')

  const definition = definitionResult.data as JsonRecord
  const run = runResult.data as JsonRecord
  const datasetId = String(definition.dataset_id)
  const profileRunId = String(run.profile_run_id ?? '')

  const [issueResult, exceptionResult, anomalyResult, cdeResult, classificationResult, outcomeResult, learningResult] = await Promise.all([
    admin.schema('governance').from('issues').select('*').eq('project_id', projectId).eq('quality_rule_run_id', qualityRuleRunId).order('updated_at', { ascending: false }),
    admin.schema('profiling').from('quality_rule_exceptions').select('*').eq('quality_rule_run_id', qualityRuleRunId).order('created_at', { ascending: false }),
    profileRunId ? admin.schema('profiling').from('profile_anomalies').select('*').eq('profile_run_id', profileRunId).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin.schema('governance').from('cde_mappings').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).order('updated_at', { ascending: false }),
    admin.schema('governance').from('dataset_classifications').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).eq('target_state', 'CURRENT').order('updated_at', { ascending: false }),
    admin.schema('governance').from('data_quality_remediation_outcomes').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }),
    admin.schema('governance').from('data_quality_recommendation_learning').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }),
  ])

  for (const [name, result] of [
    ['issues', issueResult], ['exceptions', exceptionResult], ['anomalies', anomalyResult], ['CDE mappings', cdeResult],
    ['classifications', classificationResult], ['remediation outcomes', outcomeResult], ['recommendation learning', learningResult],
  ] as const) if (result.error) throw new Error(`Unable to load ${name}: ${result.error.message}`)

  const resultState = run.result_state
  if (!isCanonicalResultState(resultState)) throw new Error(`Quality rule run has non-canonical result state: ${String(resultState)}`)

  const issues = array(issueResult.data)
  const issueIds = new Set(issues.map((issue) => String(issue.id)))
  const exceptions = array(exceptionResult.data)
  const now = Date.now()
  const validWaivers = exceptions.filter((exception) => hasValidWaiver(exception, now))
  const expiredOrInactiveWaivers = exceptions.filter((exception) => !validWaivers.includes(exception))

  const columnName = String(definition.column_name ?? '')
  const cdeMappings = array(cdeResult.data).filter((mapping) => !columnName || !mapping.column_name || String(mapping.column_name) === columnName)
  const classifications = array(classificationResult.data).filter((classification) => !columnName || !classification.column_name || String(classification.column_name) === columnName)
  const authoritativeClassifications = classifications.filter((classification) => upper(classification.status) === 'APPROVED' && upper(classification.authority_state) === 'AUTHORITATIVE')

  const outcomes = array(outcomeResult.data).filter((outcome) => stringArray(outcome.remediation_issue_ids).some((id) => issueIds.has(id)))
  const learning = array(learningResult.data).filter((item) => stringArray(item.quality_rule_run_ids).includes(qualityRuleRunId))
  const verifiedOutcomes = outcomes.filter((outcome) => upper(outcome.status) === 'VERIFIED' && Boolean(outcome.verified_at))

  const openIssues = issues.filter((issue) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(upper(issue.status)))
  const binaryMeasured = resultState === 'PASS' || resultState === 'FAIL'
  const requiresRemediation = resultState === 'FAIL' && validWaivers.length === 0
  const unavailableReason = ['NOT_MEASURED', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE'].includes(resultState)
    ? String(run.error_message ?? run.evidence?.unavailable_reason ?? run.evidence?.not_measured_reason ?? run.evidence?.not_applicable_reason ?? resultState)
    : null

  return {
    projectId,
    qualityRuleRunId,
    datasetId,
    generatedAt: new Date().toISOString(),
    truth: {
      resultState,
      binaryMeasured,
      passed: binaryMeasured ? resultState === 'PASS' : null,
      observedValue: run.observed_value ?? null,
      threshold: run.threshold ?? definition.threshold ?? null,
      unavailableReason,
      evidence: run.evidence ?? {},
      ruleVersionId: run.rule_version_id ?? definition.current_version_id ?? null,
      datasetVersionId: run.dataset_version_id,
      profileRunId: run.profile_run_id,
    },
    rule: definition,
    impact: {
      cdeMappings,
      authoritativeClassifications,
      anomalyEvidence: array(anomalyResult.data),
    },
    exceptions: {
      validWaivers,
      expiredOrInactive: expiredOrInactiveWaivers,
    },
    incident: {
      required: requiresRemediation,
      openIssues,
      allIssues: issues,
    },
    remediation: {
      outcomes,
      verifiedOutcomes,
      learning,
      verificationComplete: verifiedOutcomes.length > 0,
    },
    nextState: resultState === 'FAIL'
      ? (validWaivers.length ? 'GOVERNED_WAIVER_ACTIVE' : verifiedOutcomes.length ? 'VERIFIED_OUTCOME_AVAILABLE' : openIssues.length ? 'REMEDIATION_IN_PROGRESS' : 'INCIDENT_REQUIRED')
      : resultState === 'PASS'
        ? 'CONTROLLED'
        : 'MEASUREMENT_ATTENTION_REQUIRED',
  }
}
