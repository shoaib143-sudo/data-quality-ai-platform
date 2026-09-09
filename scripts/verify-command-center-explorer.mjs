import fs from 'node:fs'

const failures = []
const requireTokens = (path, tokens) => {
  if (!fs.existsSync(path)) {
    failures.push(`${path}: missing file`)
    return ''
  }
  const source = fs.readFileSync(path, 'utf8')
  for (const token of tokens) if (!source.includes(token)) failures.push(`${path}: missing ${token}`)
  return source
}

const layout = requireTokens('app/admin/ai-command-center/layout.tsx', [
  '/admin/ai-command-center',
  '/admin/ai-command-center/explorer',
  '/admin/ai-command-center/traces',
  '/admin/ai-command-center/resource-controls',
  '/admin/ai-command-center/audit',
])

const page = requireTokens('app/admin/ai-command-center/explorer/page.tsx', [
  "authorizeProject(user.id, selectedProjectId, 'admin.manage')",
  'createGovernanceCommandCenterState().read(selectedProjectId)',
  'CommandCenterExplorer items={items}',
  "source: 'governance.ai_systems'",
  "source: 'governance.ai_evaluation_results'",
  "source: 'governance.ai_telemetry_events'",
  "source: 'governance.data_quality_investigations'",
  "source: 'governance.ai_routing_policy_versions'",
  "source: 'governance.autonomy_actions'",
  'read-only',
])

const client = requireTokens('app/admin/ai-command-center/explorer/command-center-explorer.tsx', [
  "'use client'",
  'useMemo',
  'useState',
  'filterCommandCenterExplorerItems',
  '<details',
  'Read-only canonical evidence projection',
])

requireTokens('lib/ai/command-center-explorer.ts', [
  'filterCommandCenterExplorerItems',
  'commandCenterExplorerCounts',
  "sort?: 'NEWEST' | 'OLDEST' | 'TITLE'",
  "category?: CommandCenterExplorerCategory | 'ALL'",
])

const tracePage = requireTokens('app/admin/ai-command-center/traces/page.tsx', [
  "authorizeProject(user.id, selectedProjectId, 'admin.manage')",
  'readGovernedTraceTimeline(selectedProjectId)',
  'Read-only correlation of canonical AI telemetry carrying W3C trace IDs',
  'whitelisted evidence projection only',
  'admission evidence describes execution accounting against resource-budget controls, not governance approval',
  'does not grant governance authority',
  'event.correlationId',
  'event.invocationEvidence.routingPolicyId',
  'event.invocationEvidence.requestedMaxOutputTokens',
  'event.invocationEvidence.resourceBudgetAdmissionReason',
  'event.invocationEvidence.resourceBudgetAdmissionId',
  'event.invocationEvidence.resourceBudgetLeaseId',
  'event.invocationEvidence.resourceBudgetRequestCountLastMinute',
  'event.invocationEvidence.resourceBudgetActiveConcurrency',
  'event.invocationEvidence.providerRequestId',
  'event.invocationEvidence.providerHttpStatus',
])

const traceAdapter = requireTokens('lib/ai/governance-trace-timeline.ts', [
  "from('ai_telemetry_events')",
  '.not(\'trace_id\', \'is\', null)',
  'groupGovernedTraceEvents',
  'trace_id,span_id,parent_span_id',
  'correlation_id',
  'attributes,observed_at',
  'projectTraceInvocationEvidence(row.attributes)',
  'invocationEvidence: TraceInvocationEvidence',
])

const traceEvidence = requireTokens('lib/ai/trace-invocation-evidence.ts', [
  'projectTraceInvocationEvidence',
  'hasTraceInvocationEvidence',
  'TraceBudgetAdmissionReason',
  "'ADMITTED'",
  "'ALREADY_ADMITTED'",
  "'POLICY_NOT_CURRENT'",
  "'POLICY_DISABLED'",
  "'RATE_LIMIT'",
  "'CONCURRENCY_LIMIT'",
  'route_source',
  'route_reason',
  'routing_policy_id',
  'routing_policy_reason',
  'provider_request_id',
  'requested_max_output_tokens',
  'resource_budget_admission_reason',
  'resource_budget_admission_id',
  'resource_budget_lease_id',
  'resource_budget_request_count_last_minute',
  'resource_budget_active_concurrency',
  'provider_http_status',
  'total_tokens',
])

for (const [path, source] of [
  ['app/admin/ai-command-center/layout.tsx', layout],
  ['app/admin/ai-command-center/explorer/page.tsx', page],
  ['app/admin/ai-command-center/explorer/command-center-explorer.tsx', client],
  ['app/admin/ai-command-center/traces/page.tsx', tracePage],
  ['lib/ai/governance-trace-timeline.ts', traceAdapter],
  ['lib/ai/trace-invocation-evidence.ts', traceEvidence],
]) {
  for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', 'fetch(', 'method: \'POST\'', 'method: "POST"']) {
    if (source.includes(forbidden)) failures.push(`${path}: interactive Command Center must remain read-only; found ${forbidden}`)
  }
}

for (const forbidden of [
  'event.attributes',
  'JSON.stringify(event',
  'prompt',
  'completion',
  'hidden_reasoning',
  'api_key',
  'admission_secret',
]) {
  if (tracePage.includes(forbidden)) failures.push(`Trace page must not expose raw/arbitrary telemetry attributes; found ${forbidden}`)
}

if (!traceAdapter.includes(".select('id,project_id,trace_id,span_id,parent_span_id,event_type,operation,status,provider_id,model_name,agent_run_id,correlation_id,latency_ms,input_tokens,output_tokens,cost_usd,attributes,observed_at')")) failures.push('Trace adapter must select attributes only inside the governance adapter for whitelisted projection.')
if (traceAdapter.includes('attributes: row.attributes')) failures.push('Trace adapter must never return raw telemetry attributes to the UI.')
if (traceEvidence.includes('...source')) failures.push('Trace invocation projection must never spread arbitrary telemetry attributes.')
if (!traceEvidence.includes('BUDGET_ADMISSION_REASONS.has')) failures.push('Budget admission reason must be enum-whitelisted before projection.')
if (page.includes('createAdminClient')) failures.push('Explorer page must not introduce a new service-role read path; reuse the authorized canonical Command Center state adapter.')
if (tracePage.includes('createAdminClient')) failures.push('Trace page must authorize before using the encapsulated governance trace adapter.')
if (!page.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')")) failures.push('Explorer must require admin.manage before loading canonical evidence.')
if (!tracePage.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')")) failures.push('Trace timeline must require admin.manage before loading canonical telemetry.')

if (failures.length) {
  console.error('Command Center Explorer verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('ADR-006 Command Center Explorer, trace timeline, and whitelisted budget-admission invocation evidence boundaries verified.')
