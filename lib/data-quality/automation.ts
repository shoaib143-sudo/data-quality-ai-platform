import { createAdminClient } from '@/lib/supabase/admin'
import { writeAgentRunLog } from '@/lib/agents/run-log'

type RuleSuggestion = {
  rule_key: string
  column_name: string | null
  name: string
  description: string
  dimension: string
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  metric_key: string
  operator: 'LTE' | 'GTE' | 'EQ' | 'NEQ'
  threshold: number
  metadata?: Record<string, unknown>
}

type QualityRule = RuleSuggestion & {
  id: string
  project_id: string
  dataset_id: string
  dataset_version_id: string | null
  enabled: boolean
}

type MetricRow = {
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
}

function metricIdentity(columnName: string | null, metricKey: string) {
  return `${columnName ?? 'DATASET'}:${metricKey}`
}

function passes(operator: QualityRule['operator'], observed: number, threshold: number) {
  if (operator === 'LTE') return observed <= threshold
  if (operator === 'GTE') return observed >= threshold
  if (operator === 'EQ') return observed === threshold
  return observed !== threshold
}

async function resolveDatasetContext(datasetVersionId: string) {
  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id,version_number,status')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve dataset version for data quality automation: ${versionError?.message ?? 'not found'}`)

  const { data: dataset, error: datasetError } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id,project_id,name')
    .eq('id', version.dataset_id)
    .maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve dataset for data quality automation: ${datasetError?.message ?? 'not found'}`)
  return { admin, version, dataset }
}

export async function syncSuggestedQualityRules(datasetVersionId: string, profileRunId: string, createdBy?: string | null) {
  const { admin, version, dataset } = await resolveDatasetContext(datasetVersionId)

  const [{ data: columns, error: columnsError }, { data: metrics, error: metricsError }] = await Promise.all([
    admin.schema('profiling').from('profile_columns').select('id,column_name,inferred_type').eq('profile_run_id', profileRunId),
    admin.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value').eq('profile_run_id', profileRunId).in('metric_key', [
      'null_rate',
      'unique_rate',
      'candidate_key_confidence',
      'pattern_match_rate',
      'sensitive_match_rate',
      'outlier_rate',
      'duplicate_row_rate',
    ]),
  ])
  if (columnsError) throw new Error(`Unable to load profile columns for rule suggestions: ${columnsError.message}`)
  if (metricsError) throw new Error(`Unable to load profile metrics for rule suggestions: ${metricsError.message}`)

  const columnNames = new Map((columns ?? []).map((column) => [column.id, column.column_name]))
  const observed = new Map<string, number>()
  for (const metric of (metrics ?? []) as MetricRow[]) {
    if (typeof metric.numeric_value !== 'number') continue
    observed.set(metricIdentity(metric.profile_column_id ? columnNames.get(metric.profile_column_id) ?? null : null, metric.metric_key), metric.numeric_value)
  }

  const suggestions: RuleSuggestion[] = [{
    rule_key: 'DATASET_DUPLICATE_RATE_MAX',
    column_name: null,
    name: 'Duplicate row rate must remain below 1%',
    description: 'Prevents duplicate records from materially inflating dataset volumes and downstream business activity.',
    dimension: 'UNIQUENESS',
    severity: 'HIGH',
    metric_key: 'duplicate_row_rate',
    operator: 'LTE',
    threshold: 0.01,
    metadata: { rationale: 'Standard governance control for material duplicate exposure.', source_profile_run_id: profileRunId },
  }]

  for (const column of columns ?? []) {
    const columnName = column.column_name
    const nullRate = observed.get(metricIdentity(columnName, 'null_rate'))
    const candidateConfidence = observed.get(metricIdentity(columnName, 'candidate_key_confidence'))
    const patternRate = observed.get(metricIdentity(columnName, 'pattern_match_rate'))
    const sensitiveRate = observed.get(metricIdentity(columnName, 'sensitive_match_rate'))
    const outlierRate = observed.get(metricIdentity(columnName, 'outlier_rate'))
    const normalized = columnName.toLowerCase()

    if (typeof nullRate === 'number' && nullRate <= 0.05) {
      suggestions.push({
        rule_key: 'COLUMN_NULL_RATE_MAX',
        column_name: columnName,
        name: `${columnName} completeness must remain at least 95%`,
        description: 'Protects downstream decisions from material increases in missing values.',
        dimension: 'COMPLETENESS',
        severity: candidateConfidence !== undefined && candidateConfidence >= 0.95 ? 'HIGH' : 'MEDIUM',
        metric_key: 'null_rate',
        operator: 'LTE',
        threshold: candidateConfidence !== undefined && candidateConfidence >= 0.95 ? 0 : 0.05,
        metadata: { baseline_null_rate: nullRate, source_profile_run_id: profileRunId },
      })
    }

    if (typeof candidateConfidence === 'number' && candidateConfidence >= 0.95) {
      suggestions.push({
        rule_key: 'CANDIDATE_KEY_UNIQUENESS_MIN',
        column_name: columnName,
        name: `${columnName} candidate key must remain unique`,
        description: 'Protects record identity and prevents ambiguous joins or duplicate business entities.',
        dimension: 'UNIQUENESS',
        severity: 'HIGH',
        metric_key: 'unique_rate',
        operator: 'GTE',
        threshold: 0.99,
        metadata: { candidate_key_confidence: candidateConfidence, source_profile_run_id: profileRunId },
      })
    }

    const patternBearing = normalized.includes('email') || normalized.includes('phone') || normalized.includes('mobile') || (sensitiveRate ?? 0) >= 0.8
    if (patternBearing && typeof patternRate === 'number') {
      suggestions.push({
        rule_key: 'PATTERN_MATCH_RATE_MIN',
        column_name: columnName,
        name: `${columnName} format conformance must remain at least 98%`,
        description: 'Reduces invalid contact or identifier values that can break integrations and business workflows.',
        dimension: 'VALIDITY',
        severity: normalized.includes('email') || normalized.includes('phone') || normalized.includes('mobile') ? 'HIGH' : 'MEDIUM',
        metric_key: 'pattern_match_rate',
        operator: 'GTE',
        threshold: 0.98,
        metadata: { baseline_pattern_match_rate: patternRate, source_profile_run_id: profileRunId },
      })
    }

    if (typeof outlierRate === 'number' && outlierRate <= 0.05 && column.inferred_type === 'number') {
      suggestions.push({
        rule_key: 'OUTLIER_RATE_MAX',
        column_name: columnName,
        name: `${columnName} outlier rate must remain below 5%`,
        description: 'Surfaces distribution shifts that can distort aggregates, forecasts, pricing, or operational thresholds.',
        dimension: 'VALIDITY',
        severity: 'MEDIUM',
        metric_key: 'outlier_rate',
        operator: 'LTE',
        threshold: 0.05,
        metadata: { baseline_outlier_rate: outlierRate, source_profile_run_id: profileRunId },
      })
    }
  }

  const persisted: QualityRule[] = []
  for (const suggestion of suggestions) {
    let query = admin.schema('profiling').from('quality_rule_definitions').select('id').eq('dataset_id', dataset.id).eq('rule_key', suggestion.rule_key)
    query = suggestion.column_name ? query.eq('column_name', suggestion.column_name) : query.is('column_name', null)
    const { data: existing, error: existingError } = await query.maybeSingle()
    if (existingError) throw new Error(`Unable to resolve existing quality rule: ${existingError.message}`)

    const payload = {
      project_id: dataset.project_id,
      dataset_id: dataset.id,
      dataset_version_id: version.id,
      column_name: suggestion.column_name,
      rule_key: suggestion.rule_key,
      name: suggestion.name,
      description: suggestion.description,
      dimension: suggestion.dimension,
      severity: suggestion.severity,
      metric_key: suggestion.metric_key,
      operator: suggestion.operator,
      threshold: suggestion.threshold,
      enabled: true,
      origin: 'SUGGESTED',
      metadata: suggestion.metadata ?? {},
      created_by: createdBy ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { data, error } = await admin.schema('profiling').from('quality_rule_definitions').update(payload).eq('id', existing.id).select('*').single()
      if (error || !data) throw new Error(`Unable to update suggested quality rule: ${error?.message ?? 'unknown error'}`)
      persisted.push(data as QualityRule)
    } else {
      const { data, error } = await admin.schema('profiling').from('quality_rule_definitions').insert(payload).select('*').single()
      if (error || !data) throw new Error(`Unable to create suggested quality rule: ${error?.message ?? 'unknown error'}`)
      persisted.push(data as QualityRule)
    }
  }

  return { rules: persisted, dataset, version, profileRunId }
}

export async function executeQualityAutomation(input: {
  datasetVersionId: string
  profileRunId: string
  userId?: string | null
  parentRunId?: string | null
  existingAgentRunId?: string | null
}) {
  const { datasetVersionId, profileRunId, userId = null, parentRunId = null, existingAgentRunId = null } = input
  const { admin, version, dataset } = await resolveDatasetContext(datasetVersionId)

  const { data: agentDefinition, error: agentError } = await admin
    .schema('agent')
    .from('agent_definitions')
    .select('id,agent_key,version')
    .eq('agent_key', 'data_quality_agent')
    .eq('version', '1.0')
    .eq('enabled', true)
    .maybeSingle()
  if (agentError || !agentDefinition) throw new Error(`Data Quality Agent 1.0 is unavailable: ${agentError?.message ?? 'not registered'}`)

  const now = new Date().toISOString()
  let agentRunId: string
  if (existingAgentRunId) {
    const { data: existingRun, error: existingRunError } = await admin.schema('agent').from('agent_runs').select('id,agent_definition_id,project_id,dataset_id,dataset_version_id,status').eq('id', existingAgentRunId).maybeSingle()
    if (existingRunError || !existingRun) throw new Error(`Unable to resolve queued data quality job: ${existingRunError?.message ?? 'not found'}`)
    if (existingRun.agent_definition_id !== agentDefinition.id || existingRun.project_id !== dataset.project_id || existingRun.dataset_version_id !== version.id) throw new Error('Queued data quality job does not match the requested dataset and agent.')
    const { error: startError } = await admin.schema('agent').from('agent_runs').update({ status: 'RUNNING', started_at: now }).eq('id', existingAgentRunId).eq('status', 'QUEUED')
    if (startError) throw new Error(`Unable to start queued data quality job: ${startError.message}`)
    agentRunId = existingAgentRunId
  } else {
    const { data: agentRun, error: runError } = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: agentDefinition.id,
      project_id: dataset.project_id,
      dataset_id: dataset.id,
      dataset_version_id: version.id,
      parent_run_id: parentRunId,
      status: 'RUNNING',
      input: { datasetVersionId, profileRunId, automation: true },
      started_at: now,
    }).select('id').single()
    if (runError || !agentRun) throw new Error(`Unable to create data quality job: ${runError?.message ?? 'unknown error'}`)
    agentRunId = agentRun.id
  }
  let currentStepId: string | null = null
  try {
    const { data: syncStep, error: syncStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: 'sync_quality_rules',
      step_order: 1,
      status: 'RUNNING',
      input: { datasetVersionId, profileRunId },
      started_at: now,
    }).select('id').single()
    if (syncStepError || !syncStep) throw new Error(`Unable to create quality rule sync step: ${syncStepError?.message ?? 'unknown error'}`)
    currentStepId = syncStep.id

    const synced = await syncSuggestedQualityRules(datasetVersionId, profileRunId, userId)
    await admin.schema('agent').from('agent_run_steps').update({
      status: 'SUCCEEDED',
      output: { rule_count: synced.rules.length },
      completed_at: new Date().toISOString(),
    }).eq('id', currentStepId)
    await writeAgentRunLog({ agentRunId, agentRunStepId: currentStepId, level: 'TOOL', eventType: 'QUALITY_RULES_SYNCED', message: `${synced.rules.length} data quality rules are active for this dataset.`, details: { datasetVersionId, profileRunId, rule_count: synced.rules.length } })

    const { data: executeStep, error: executeStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: 'execute_quality_rules',
      step_order: 2,
      status: 'RUNNING',
      input: { datasetVersionId, profileRunId },
      started_at: new Date().toISOString(),
    }).select('id').single()
    if (executeStepError || !executeStep) throw new Error(`Unable to create quality execution step: ${executeStepError?.message ?? 'unknown error'}`)
    currentStepId = executeStep.id

    const [{ data: rules, error: rulesError }, { data: columns, error: columnsError }, { data: metrics, error: metricsError }] = await Promise.all([
      admin.schema('profiling').from('quality_rule_definitions').select('*').eq('dataset_id', dataset.id).eq('enabled', true).order('severity'),
      admin.schema('profiling').from('profile_columns').select('id,column_name').eq('profile_run_id', profileRunId),
      admin.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value').eq('profile_run_id', profileRunId),
    ])
    if (rulesError) throw new Error(`Unable to load quality rules: ${rulesError.message}`)
    if (columnsError) throw new Error(`Unable to load quality rule columns: ${columnsError.message}`)
    if (metricsError) throw new Error(`Unable to load quality rule metrics: ${metricsError.message}`)

    const columnNames = new Map((columns ?? []).map((column) => [column.id, column.column_name]))
    const metricValues = new Map<string, number>()
    for (const metric of (metrics ?? []) as MetricRow[]) {
      if (typeof metric.numeric_value !== 'number') continue
      const columnName = metric.profile_column_id ? columnNames.get(metric.profile_column_id) ?? null : null
      metricValues.set(metricIdentity(columnName, metric.metric_key), metric.numeric_value)
    }

    const results = (rules ?? []).map((rule) => {
      const typedRule = rule as QualityRule
      const observedValue = metricValues.get(metricIdentity(typedRule.column_name, typedRule.metric_key))
      if (observedValue === undefined || typedRule.threshold === null || typedRule.threshold === undefined) {
        return {
          rule_definition_id: typedRule.id,
          agent_run_id: agentRunId,
          dataset_version_id: datasetVersionId,
          profile_run_id: profileRunId,
          status: 'ERROR',
          passed: null,
          observed_value: null,
          threshold: typedRule.threshold,
          evidence: { metric_key: typedRule.metric_key, column_name: typedRule.column_name, reason: 'Required profiling metric was not persisted.' },
          error_message: 'Required profiling metric was not persisted.',
          completed_at: new Date().toISOString(),
        }
      }
      const passed = passes(typedRule.operator, observedValue, Number(typedRule.threshold))
      return {
        rule_definition_id: typedRule.id,
        agent_run_id: agentRunId,
        dataset_version_id: datasetVersionId,
        profile_run_id: profileRunId,
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        observed_value: observedValue,
        threshold: typedRule.threshold,
        evidence: { metric_key: typedRule.metric_key, column_name: typedRule.column_name, operator: typedRule.operator, dimension: typedRule.dimension, severity: typedRule.severity },
        error_message: null,
        completed_at: new Date().toISOString(),
      }
    })

    if (results.length) {
      const { error: resultError } = await admin.schema('profiling').from('quality_rule_runs').insert(results)
      if (resultError) throw new Error(`Unable to persist quality rule outcomes: ${resultError.message}`)
    }

    const passedCount = results.filter((result) => result.status === 'PASSED').length
    const failedCount = results.filter((result) => result.status === 'FAILED').length
    const errorCount = results.filter((result) => result.status === 'ERROR').length

    await admin.schema('agent').from('agent_run_steps').update({
      status: errorCount ? 'FAILED' : 'SUCCEEDED',
      output: { total: results.length, passed: passedCount, failed: failedCount, errors: errorCount },
      error_code: errorCount ? 'QUALITY_METRIC_MISSING' : null,
      error_message: errorCount ? `${errorCount} rules could not be evaluated because required metrics were missing.` : null,
      completed_at: new Date().toISOString(),
    }).eq('id', currentStepId)

    if (errorCount) throw new Error(`${errorCount} data quality rules could not be evaluated because required metrics were missing.`)

    const { data: publishStep, error: publishStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: 'publish_quality_results',
      step_order: 3,
      status: 'RUNNING',
      input: { datasetVersionId, profileRunId },
      started_at: new Date().toISOString(),
    }).select('id').single()
    if (publishStepError || !publishStep) throw new Error(`Unable to create quality publish step: ${publishStepError?.message ?? 'unknown error'}`)
    currentStepId = publishStep.id

    const summary = {
      execution_completed: true,
      data_quality_job: true,
      dataset_version_id: datasetVersionId,
      profile_run_id: profileRunId,
      rules_total: results.length,
      rules_passed: passedCount,
      rules_failed: failedCount,
      pass_rate: results.length ? passedCount / results.length : 1,
      governance_status: failedCount ? 'ATTENTION_REQUIRED' : 'CONTROLLED',
    }
    const completedAt = new Date().toISOString()
    await admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: summary, completed_at: completedAt }).eq('id', currentStepId)
    await admin.schema('agent').from('agent_runs').update({ status: 'SUCCEEDED', output: summary, completed_at: completedAt }).eq('id', agentRunId)
    await writeAgentRunLog({ agentRunId, agentRunStepId: currentStepId, level: 'LIFECYCLE', eventType: 'QUALITY_AUTOMATION_COMPLETED', message: `Data quality automation completed: ${passedCount} passed, ${failedCount} failed.`, details: summary })

    return { agentRunId, ...summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Data quality automation failed.'
    const completedAt = new Date().toISOString()
    if (currentStepId) await admin.schema('agent').from('agent_run_steps').update({ status: 'FAILED', error_code: 'DATA_QUALITY_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', currentStepId).eq('status', 'RUNNING')
    await admin.schema('agent').from('agent_runs').update({ status: 'FAILED', error_code: 'DATA_QUALITY_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', agentRunId).eq('status', 'RUNNING')
    await writeAgentRunLog({ agentRunId, agentRunStepId: currentStepId ?? undefined, level: 'ERROR', eventType: 'QUALITY_AUTOMATION_FAILED', message, details: { datasetVersionId, profileRunId } })
    throw error
  }
}
