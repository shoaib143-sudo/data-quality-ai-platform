import { ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { createGovernanceCommandCenterState } from '@/lib/ai/governance-command-center-state'
import type { CommandCenterExplorerItem } from '@/lib/ai/command-center-explorer'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import CommandCenterExplorer from './command-center-explorer'

type Project = { id: string; name: string }

function value(input: unknown) {
  if (input == null) return 'Not recorded'
  if (Array.isArray(input)) return input.length ? input.map((item) => String(item)).join(', ') : 'None recorded'
  if (typeof input === 'object') return JSON.stringify(input)
  return String(input)
}

export default async function AICommandCenterExplorerPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id

  let items: CommandCenterExplorerItem[] = []
  if (selectedProjectId) {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    const state = await createGovernanceCommandCenterState().read(selectedProjectId)
    const systemNames = new Map(state.aiSystems.map((system) => [system.id, system.name]))

    items = [
      ...state.aiSystems.map((system): CommandCenterExplorerItem => ({
        id: system.id,
        category: 'AI_SYSTEM',
        title: system.name,
        subtitle: `${system.system_type} · ${system.system_key}`,
        status: system.lifecycle_status,
        source: 'governance.ai_systems',
        timestamp: null,
        details: [
          { label: 'System key', value: system.system_key },
          { label: 'System type', value: system.system_type },
          { label: 'Current version ID', value: system.current_version_id ?? 'No current version recorded' },
        ],
      })),
      ...state.findings.map((finding): CommandCenterExplorerItem => ({
        id: `${finding.source}:${finding.recordId}:${finding.code}`,
        category: 'FINDING',
        title: finding.code,
        subtitle: finding.message,
        status: finding.severity,
        source: finding.source,
        timestamp: null,
        details: [
          { label: 'Record ID', value: finding.recordId },
          { label: 'Finding code', value: finding.code },
          { label: 'Severity', value: finding.severity },
        ],
      })),
      ...state.aiEvaluationResults.map((evaluation): CommandCenterExplorerItem => ({
        id: evaluation.id,
        category: 'EVALUATION',
        title: `${evaluation.evaluation_type} · ${evaluation.metric_name}`,
        subtitle: evaluation.ai_system_id ? systemNames.get(evaluation.ai_system_id) ?? evaluation.ai_system_id : 'Evaluation is not bound to an AI system',
        status: evaluation.pass == null ? 'NOT_ASSESSED' : evaluation.pass ? 'PASS' : 'FAIL',
        source: 'governance.ai_evaluation_results',
        timestamp: evaluation.observed_at,
        details: [
          { label: 'Capability', value: evaluation.capability ?? 'Not recorded' },
          { label: 'Score', value: evaluation.score == null ? 'Not scored' : String(evaluation.score) },
          { label: 'Evaluator', value: `${evaluation.evaluator_type}${evaluation.evaluator_version ? ` · ${evaluation.evaluator_version}` : ''}` },
          { label: 'Evidence refs', value: String(evaluation.evidence_refs.length) },
          { label: 'AI system version ID', value: evaluation.ai_system_version_id ?? 'Not bound' },
          { label: 'Correlation ID', value: evaluation.correlation_id ?? 'Not recorded' },
        ],
      })),
      ...state.aiTelemetryEvents.map((event): CommandCenterExplorerItem => ({
        id: event.id,
        category: 'TELEMETRY',
        title: `${event.event_type} · ${event.operation}`,
        subtitle: event.provider_id || event.model_name ? `${event.provider_id ?? 'Provider not recorded'} / ${event.model_name ?? 'Model not recorded'}` : 'No provider/model identity recorded',
        status: event.status,
        source: 'governance.ai_telemetry_events',
        timestamp: event.observed_at,
        details: [
          { label: 'Latency ms', value: value(event.latency_ms) },
          { label: 'Input tokens', value: value(event.input_tokens) },
          { label: 'Output tokens', value: value(event.output_tokens) },
          { label: 'Cost USD', value: value(event.cost_usd) },
          { label: 'Agent run ID', value: event.agent_run_id ?? 'Not bound' },
          { label: 'Correlation ID', value: event.correlation_id ?? 'Not recorded' },
        ],
      })),
      ...state.dataQualityInvestigations.map((investigation): CommandCenterExplorerItem => ({
        id: investigation.id,
        category: 'INVESTIGATION',
        title: investigation.summary,
        subtitle: `Dataset ${investigation.dataset_id}`,
        status: investigation.status,
        source: 'governance.data_quality_investigations',
        timestamp: investigation.updated_at,
        details: [
          { label: 'Severity', value: investigation.severity },
          { label: 'Approval required', value: investigation.approval_required ? 'Yes' : 'No' },
          { label: 'Agent run ID', value: investigation.agent_run_id },
          { label: 'Dataset version ID', value: investigation.dataset_version_id },
          { label: 'Profile run ID', value: investigation.profile_run_id ?? 'Not bound' },
          { label: 'Workflow instance ID', value: investigation.workflow_instance_id ?? 'Not bound' },
        ],
      })),
      ...state.routingPolicies.map((policy): CommandCenterExplorerItem => ({
        id: policy.id,
        category: 'ROUTING_POLICY',
        title: `Routing policy · ${policy.task}`,
        subtitle: `${policy.sensitivity} sensitivity · ${policy.risk} risk`,
        status: policy.enabled ? 'ENABLED' : 'DISABLED',
        source: 'governance.ai_routing_policy_versions',
        timestamp: policy.created_at,
        details: [
          { label: 'Minimum evaluation score', value: value(policy.min_evaluation_score) },
          { label: 'Minimum scored count', value: String(policy.min_scored_count) },
          { label: 'Environment fallback', value: policy.allow_environment_fallback ? 'Allowed' : 'Denied' },
          { label: 'Allowed AI systems', value: value(policy.allowed_ai_system_ids) },
          { label: 'Reviewer capability', value: policy.reviewer_capability },
        ],
      })),
      ...state.autonomyActions.map((action): CommandCenterExplorerItem => ({
        id: action.id,
        category: 'AUTONOMY_ACTION',
        title: action.action_key,
        subtitle: `${action.risk_level} risk · confidence ${action.confidence}`,
        status: action.status,
        source: 'governance.autonomy_actions',
        timestamp: action.executed_at ?? action.rolled_back_at ?? action.created_at,
        details: [
          { label: 'Policy version ID', value: action.policy_version_id },
          { label: 'Approval workflow', value: action.approval_workflow_instance_id ?? 'Not required or not recorded' },
          { label: 'Created', value: action.created_at },
          { label: 'Executed', value: action.executed_at ?? 'Not executed' },
          { label: 'Rolled back', value: action.rolled_back_at ?? 'Not rolled back' },
        ],
      })),
    ]
  }

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><ShieldCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">AI Governance Plane</p><h1 className="text-3xl font-black">Command Center Explorer</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Interactively filter and inspect canonical AI systems, safety findings, evaluations, telemetry, investigations, routing policies and autonomy actions. This surface is read-only and does not grant governance or execution authority.</p></div></div>
      </header>

      <form method="get" className="rounded-2xl border bg-white p-5"><label className="block text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load evidence</button></form>

      {!selectedProjectId ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <CommandCenterExplorer items={items}/>} 
    </div>
  </main>
}
