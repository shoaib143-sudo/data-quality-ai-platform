import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type QualityRun = {
  id: string
  rule_definition_id: string
  status: string
  observed_value: number | null
  threshold: number | null
  evidence: Record<string, unknown> | null
}

type QualityRule = {
  id: string
  rule_key: string
  name: string
  description: string | null
  dimension: string
  severity: Severity
  metric_key: string
  operator: string
  threshold: number | null
  column_name: string | null
  rule_type?: string | null
  rule_config?: Record<string, unknown> | null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function severityRank(value: unknown) {
  const ranks: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  return ranks[text(value).toUpperCase()] ?? 0
}

function maxSeverity(values: unknown[]): Severity {
  const ordered: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  return ordered[Math.max(0, ...values.map(severityRank))] ?? 'INFO'
}

function issuePriority(value: Severity) {
  return value === 'CRITICAL' ? 'CRITICAL' : value === 'HIGH' ? 'HIGH' : value === 'LOW' ? 'LOW' : 'MEDIUM'
}

function recommendationFor(rule: QualityRule, runIds: string[]) {
  const metric = text(rule.metric_key).toLowerCase()
  const type = text(rule.rule_type).toUpperCase()
  const column = rule.column_name || 'dataset'

  if (metric === 'null_rate' || type === 'REQUIRED') {
    return {
      action: 'restore_upstream_required_values',
      priority: issuePriority(rule.severity),
      rationale: `${column} has missing required values. Trace the producing pipeline or source-system mapping and restore required-field population before release.`,
      approval_required: severityRank(rule.severity) >= severityRank('HIGH'),
      quality_rule_run_ids: runIds,
    }
  }

  if (metric === 'duplicate_row_rate' || metric === 'unique_rate' || type === 'UNIQUE' || type === 'ROW_UNIQUE') {
    return {
      action: 'review_duplicate_generation_and_deduplication',
      priority: issuePriority(rule.severity),
      rationale: `${column} failed a uniqueness control. Identify the duplicate-producing path, validate the governing key, and apply an approved deduplication policy.`,
      approval_required: true,
      quality_rule_run_ids: runIds,
    }
  }

  if (metric === 'pattern_match_rate' || type === 'REGEX' || type === 'IN_SET') {
    return {
      action: 'correct_invalid_domain_or_format_values',
      priority: issuePriority(rule.severity),
      rationale: `${column} contains values outside the governed format or domain. Correct the source mapping or validation control and re-run the rule before release.`,
      approval_required: severityRank(rule.severity) >= severityRank('HIGH'),
      quality_rule_run_ids: runIds,
    }
  }

  if (metric === 'outlier_rate' || type === 'RANGE') {
    return {
      action: 'investigate_distribution_or_range_shift',
      priority: issuePriority(rule.severity),
      rationale: `${column} moved outside the governed statistical or business range. Confirm whether the change is legitimate before altering thresholds or source values.`,
      approval_required: severityRank(rule.severity) >= severityRank('HIGH'),
      quality_rule_run_ids: runIds,
    }
  }

  return {
    action: 'investigate_failed_quality_control',
    priority: issuePriority(rule.severity),
    rationale: `${rule.name} failed. Validate the evidence, upstream producer and applicable quality policy before making any governed change.`,
    approval_required: severityRank(rule.severity) >= severityRank('HIGH'),
    quality_rule_run_ids: runIds,
  }
}

function rootCauseFor(rule: QualityRule, count: number) {
  const metric = text(rule.metric_key).toLowerCase()
  if (metric === 'null_rate') return { cause: 'UPSTREAM_COMPLETENESS_GAP', confidence: 0.82, evidence: { rule: rule.name, failures: count, column: rule.column_name } }
  if (metric === 'duplicate_row_rate' || metric === 'unique_rate') return { cause: 'DUPLICATE_OR_IDENTITY_GENERATION', confidence: 0.84, evidence: { rule: rule.name, failures: count, column: rule.column_name } }
  if (metric === 'pattern_match_rate') return { cause: 'SOURCE_VALIDATION_OR_MAPPING_GAP', confidence: 0.8, evidence: { rule: rule.name, failures: count, column: rule.column_name } }
  if (metric === 'outlier_rate') return { cause: 'DISTRIBUTION_SHIFT_OR_SOURCE_ANOMALY', confidence: 0.72, evidence: { rule: rule.name, failures: count, column: rule.column_name } }
  return { cause: 'QUALITY_CONTROL_BREACH', confidence: 0.65, evidence: { rule: rule.name, failures: count, column: rule.column_name } }
}

async function ensureApprovalWorkflow(input: {
  projectId: string
  userId: string | null
  agentRunId: string
  datasetId: string
  datasetVersionId: string
  profileRunId: string | null
  investigationId: string
  recommendations: Array<Record<string, unknown>>
  evidence: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const workflowKey = 'DATA_QUALITY_REMEDIATION_APPROVAL'

  let { data: definition, error: definitionError } = await admin
    .schema('governance')
    .from('workflow_definitions')
    .select('id,workflow_key,version,entity_type,enabled')
    .eq('project_id', input.projectId)
    .eq('workflow_key', workflowKey)
    .eq('entity_type', 'DATA_QUALITY_RUN')
    .eq('enabled', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (definitionError) throw new Error(`Unable to resolve data quality approval workflow: ${definitionError.message}`)

  let autoProvisioned = false
  if (!definition) {
    const { data: created, error: createError } = await admin
      .schema('governance')
      .from('workflow_definitions')
      .insert({
        project_id: input.projectId,
        workflow_key: workflowKey,
        name: 'Data quality remediation approval',
        entity_type: 'DATA_QUALITY_RUN',
        version: 1,
        steps: [{
          index: 0,
          name: 'Data owner approval',
          capability: 'policy.approve',
          description: 'Review deterministic data quality investigation evidence and approve or reject the governed remediation plan.',
        }],
        enabled: true,
        created_by: input.userId,
      })
      .select('id,workflow_key,version,entity_type,enabled')
      .single()

    if (createError || !created) {
      const { data: raced, error: racedError } = await admin
        .schema('governance')
        .from('workflow_definitions')
        .select('id,workflow_key,version,entity_type,enabled')
        .eq('project_id', input.projectId)
        .eq('workflow_key', workflowKey)
        .eq('entity_type', 'DATA_QUALITY_RUN')
        .eq('enabled', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (racedError || !raced) throw new Error(`Unable to provision data quality approval workflow: ${createError?.message ?? racedError?.message ?? 'unknown error'}`)
      definition = raced
    } else {
      definition = created
      autoProvisioned = true
      await writeGovernanceAudit({
        projectId: input.projectId,
        actorUserId: input.userId,
        actorType: input.userId ? 'USER' : 'SYSTEM',
        eventType: 'WORKFLOW_DEFINITION_CREATED',
        entityType: 'WORKFLOW_DEFINITION',
        entityId: created.id,
        metadata: { workflow_key: workflowKey, version: created.version, entity_type: 'DATA_QUALITY_RUN', source: 'DATA_QUALITY_AUTONOMOUS_OPERATIONS' },
      })
    }
  }

  const { data: existing, error: existingError } = await admin
    .schema('governance')
    .from('workflow_instances')
    .select('id,status,current_step')
    .eq('workflow_definition_id', definition.id)
    .eq('entity_type', 'DATA_QUALITY_RUN')
    .eq('entity_id', input.agentRunId)
    .in('status', ['RUNNING', 'APPROVED'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve existing data quality approval: ${existingError.message}`)
  if (existing) return { instanceId: existing.id as string, status: existing.status as string, autoProvisioned, reused: true }

  const approvalRecommendations = input.recommendations.filter((item) => item.approval_required === true)
  const { data: instanceId, error: startError } = await admin
    .schema('governance')
    .rpc('start_workflow', {
      p_definition_id: definition.id,
      p_entity_type: 'DATA_QUALITY_RUN',
      p_entity_id: input.agentRunId,
      p_started_by: input.userId,
      p_context: {
        source: 'DATA_QUALITY_INVESTIGATION',
        investigation_id: input.investigationId,
        data_quality_agent_run_id: input.agentRunId,
        dataset_id: input.datasetId,
        dataset_version_id: input.datasetVersionId,
        profile_run_id: input.profileRunId,
        recommendations: approvalRecommendations,
        evidence: input.evidence,
      },
    })
  if (startError || !instanceId) throw new Error(`Unable to start data quality approval workflow: ${startError?.message ?? 'unknown error'}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    actorType: input.userId ? 'USER' : 'SYSTEM',
    eventType: 'DATA_QUALITY_APPROVAL_STARTED',
    entityType: 'DATA_QUALITY_RUN',
    entityId: input.agentRunId,
    correlationId: String(instanceId),
    metadata: {
      workflow_instance_id: instanceId,
      workflow_definition_id: definition.id,
      recommendation_count: approvalRecommendations.length,
      auto_provisioned_definition: autoProvisioned,
    },
  })

  return { instanceId: String(instanceId), status: 'RUNNING', autoProvisioned, reused: false }
}

export async function investigateDataQualityRun(input: { agentRunId: string; userId?: string | null }) {
  const admin = createAdminClient()
  const userId = input.userId?.trim() || null

  const { data: agentRun, error: runError } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('id,project_id,dataset_id,dataset_version_id,status,input,output')
    .eq('id', input.agentRunId)
    .maybeSingle()
  if (runError || !agentRun) throw new Error(`Unable to resolve data quality agent run: ${runError?.message ?? 'not found'}`)
  if (agentRun.status !== 'SUCCEEDED') throw new Error(`Data quality investigation requires a successful agent run, received ${agentRun.status}.`)
  if (!agentRun.dataset_id || !agentRun.dataset_version_id) throw new Error('Data quality agent run is missing dataset context.')

  const runInput = object(agentRun.input)
  const runOutput = object(agentRun.output)
  const profileRunId = text(runOutput.profile_run_id) || text(runInput.profileRunId) || null

  const { data: qualityRuns, error: qualityRunsError } = await admin
    .schema('profiling')
    .from('quality_rule_runs')
    .select('id,rule_definition_id,status,observed_value,threshold,evidence')
    .eq('agent_run_id', input.agentRunId)
  if (qualityRunsError) throw new Error(`Unable to load data quality outcomes: ${qualityRunsError.message}`)

  const typedRuns = (qualityRuns ?? []) as QualityRun[]
  const failedRuns = typedRuns.filter((row) => row.status === 'FAILED')
  const ruleIds = [...new Set(failedRuns.map((row) => row.rule_definition_id))]
  const { data: rules, error: rulesError } = ruleIds.length
    ? await admin.schema('profiling').from('quality_rule_definitions').select('id,rule_key,name,description,dimension,severity,metric_key,operator,threshold,column_name,rule_type,rule_config').in('id', ruleIds)
    : { data: [], error: null }
  if (rulesError) throw new Error(`Unable to load failed data quality rules: ${rulesError.message}`)

  const ruleById = new Map((rules ?? []).map((row) => [row.id, row as QualityRule]))
  const grouped = new Map<string, QualityRun[]>()
  for (const run of failedRuns) grouped.set(run.rule_definition_id, [...(grouped.get(run.rule_definition_id) ?? []), run])

  const [{ data: exceptions, error: exceptionError }, { data: quarantine, error: quarantineError }] = await Promise.all([
    failedRuns.length
      ? admin.schema('profiling').from('quality_rule_exceptions').select('id,quality_rule_run_id,rule_definition_id,record_hash,column_name,reason').in('quality_rule_run_id', failedRuns.map((row) => row.id)).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    failedRuns.length
      ? admin.schema('profiling').from('quality_quarantine_records').select('id,quality_rule_run_id,status,record_hash,reason').in('quality_rule_run_id', failedRuns.map((row) => row.id)).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (exceptionError) throw new Error(`Unable to load quality exceptions: ${exceptionError.message}`)
  if (quarantineError) throw new Error(`Unable to load quarantine evidence: ${quarantineError.message}`)

  const failedRules = [...grouped.entries()].flatMap(([ruleId, runs]) => {
    const rule = ruleById.get(ruleId)
    return rule ? [{ rule, runs }] : []
  })
  const severity = failedRules.length ? maxSeverity(failedRules.map(({ rule }) => rule.severity)) : 'INFO'
  const probableRootCauses = failedRules.map(({ rule, runs }) => rootCauseFor(rule, runs.length))

  const recommendationMap = new Map<string, Record<string, unknown>>()
  for (const { rule, runs } of failedRules) {
    const recommendation = recommendationFor(rule, runs.map((row) => row.id))
    const current = recommendationMap.get(recommendation.action)
    if (!current) {
      recommendationMap.set(recommendation.action, {
        ...recommendation,
        rule_definition_ids: [rule.id],
        rules: [rule.name],
      })
      continue
    }
    const currentRunIds = Array.isArray(current.quality_rule_run_ids) ? current.quality_rule_run_ids as string[] : []
    const currentRuleIds = Array.isArray(current.rule_definition_ids) ? current.rule_definition_ids as string[] : []
    const currentRules = Array.isArray(current.rules) ? current.rules as string[] : []
    current.quality_rule_run_ids = [...new Set([...currentRunIds, ...runs.map((row) => row.id)])]
    current.rule_definition_ids = [...new Set([...currentRuleIds, rule.id])]
    current.rules = [...new Set([...currentRules, rule.name])]
    current.approval_required = current.approval_required === true || recommendation.approval_required
    if (severityRank(recommendation.priority) > severityRank(current.priority)) current.priority = recommendation.priority
  }
  const recommendations = [...recommendationMap.values()]
  const approvalRequired = recommendations.some((item) => item.approval_required === true)
  const status = failedRuns.length ? (approvalRequired ? 'APPROVAL_REQUIRED' : 'ATTENTION_REQUIRED') : 'CONTROLLED'

  const evidence = {
    total_rule_runs: typedRuns.length,
    failed_rule_runs: failedRuns.length,
    failed_rule_definitions: failedRules.length,
    row_exceptions: exceptions?.length ?? 0,
    quarantined_records: quarantine?.filter((row) => row.status === 'QUARANTINED').length ?? 0,
    profile_run_id: profileRunId,
    failed_rules: failedRules.map(({ rule, runs }) => ({
      rule_definition_id: rule.id,
      rule_key: rule.rule_key,
      name: rule.name,
      dimension: rule.dimension,
      severity: rule.severity,
      column_name: rule.column_name,
      metric_key: rule.metric_key,
      observed_values: runs.map((run) => run.observed_value),
      thresholds: runs.map((run) => run.threshold),
      quality_rule_run_ids: runs.map((run) => run.id),
    })),
  }

  const summary = failedRuns.length
    ? `${failedRuns.length} data quality control outcome${failedRuns.length === 1 ? '' : 's'} failed across ${failedRules.length} governed rule${failedRules.length === 1 ? '' : 's'}. Highest severity is ${severity}.`
    : 'All executed data quality controls passed. No remediation is required.'
  const businessImpact = failedRuns.length
    ? 'Failed controls can propagate invalid, incomplete, duplicate or anomalous records into downstream reporting, analytics, integrations and governed decisions.'
    : 'No material quality-control impact was detected in this execution.'

  const now = new Date().toISOString()
  const { data: investigation, error: investigationError } = await admin
    .schema('governance')
    .from('data_quality_investigations')
    .upsert({
      project_id: agentRun.project_id,
      agent_run_id: input.agentRunId,
      dataset_id: agentRun.dataset_id,
      dataset_version_id: agentRun.dataset_version_id,
      profile_run_id: profileRunId,
      severity,
      status,
      summary,
      probable_root_causes: probableRootCauses,
      business_impact: businessImpact,
      risk: { severity, failed_rule_runs: failedRuns.length, quarantined_records: quarantine?.length ?? 0 },
      recommendations,
      approval_required: approvalRequired,
      evidence,
      updated_at: now,
    }, { onConflict: 'agent_run_id' })
    .select('id,status,workflow_instance_id')
    .single()
  if (investigationError || !investigation) throw new Error(`Unable to persist data quality investigation: ${investigationError?.message ?? 'unknown error'}`)

  let workflow: { instanceId: string; status: string; autoProvisioned: boolean; reused: boolean } | null = null
  if (approvalRequired) {
    workflow = await ensureApprovalWorkflow({
      projectId: agentRun.project_id,
      userId,
      agentRunId: input.agentRunId,
      datasetId: agentRun.dataset_id,
      datasetVersionId: agentRun.dataset_version_id,
      profileRunId,
      investigationId: investigation.id,
      recommendations,
      evidence,
    })
    await admin.schema('governance').from('data_quality_investigations').update({
      workflow_instance_id: workflow.instanceId,
      status: 'APPROVAL_REQUIRED',
      updated_at: new Date().toISOString(),
    }).eq('id', investigation.id)
  }

  await writeGovernanceAudit({
    projectId: agentRun.project_id,
    actorUserId: userId,
    actorType: userId ? 'USER' : 'AGENT',
    eventType: failedRuns.length ? 'DATA_QUALITY_INVESTIGATION_COMPLETED' : 'DATA_QUALITY_CONTROLS_VERIFIED',
    entityType: 'DATA_QUALITY_RUN',
    entityId: input.agentRunId,
    correlationId: workflow?.instanceId ?? null,
    metadata: {
      investigation_id: investigation.id,
      severity,
      failed_rule_runs: failedRuns.length,
      failed_rule_definitions: failedRules.length,
      approval_required: approvalRequired,
      workflow_instance_id: workflow?.instanceId ?? null,
    },
  })

  return {
    investigationId: investigation.id,
    agentRunId: input.agentRunId,
    datasetId: agentRun.dataset_id,
    datasetVersionId: agentRun.dataset_version_id,
    profileRunId,
    status,
    severity,
    approvalRequired,
    recommendations,
    probableRootCauses,
    evidence,
    workflow,
  }
}
