import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { canViewExecutionRun } from '@/lib/governance/resource-authorization'
import { authorizeAgentAction } from '@/lib/governance/agent-authorization'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

type AgentRun = {
  id: string
  agent_definition_id: string
  project_id: string
  dataset_id: string | null
  dataset_version_id: string | null
  parent_run_id: string | null
  correlation_id: string | null
  status: string
  input: unknown
  output: unknown
  error_code: string | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

type AgentRunStep = {
  id: string
  step_name: string
  step_order: number
  status: string
  attempt: number
  input: unknown
  output: unknown
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

type AgentRunLog = {
  id: string
  agent_run_step_id: string | null
  level: string
  event_type: string
  message: string
  details: unknown
  created_at: string
}

type AgentMessage = {
  id: string
  source_agent_run_id: string | null
  target_agent_run_id: string | null
  message_type: string
  correlation_id: string | null
  payload: unknown
  status: string
  created_at: string
  delivered_at: string | null
  processed_at: string | null
}

type AgentArtifact = {
  id: string
  artifact_type: string
  artifact_version: string
  name: string
  payload: unknown
  storage_uri: string | null
  content_hash: string | null
  created_at: string
}

type AgentToolInvocation = {
  id: string
  tool_key: string
  tool_version: string
  executor_key: string
  read_only: boolean
  idempotent: boolean
  status: string
  input_hash: string
  output_hash: string | null
  contract_hash: string
  approval_interrupt_id: string | null
  started_at: string
  completed_at: string | null
  error_code: string | null
  error_summary: string | null
}

type AgentCheckpoint = {
  id: string
  checkpoint_seq: number
  checkpoint_kind: string
  state_version: string
  state_hash: string
  step_name: string | null
  step_order: number | null
  created_at: string
}

type AgentInterrupt = {
  id: string
  interrupt_type: string
  status: string
  decision: string | null
  request_summary: string | null
  action_key: string | null
  action_payload_hash: string | null
  requested_at: string
  expires_at: string | null
  resolved_at: string | null
  resumed_at: string | null
}

type AgentSupervisorEvent = {
  id: string
  event_type: string
  plan_hash: string
  step_id: string | null
  step_order: number | null
  agent_key: string | null
  tool_key: string | null
  contract_hash: string | null
  input_hash: string | null
  output_hash: string | null
  execution_decision: string | null
  risk_tier: number | null
  attempt: number | null
  detail_code: string | null
  created_at: string
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">None</span>
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}

export default async function AgentRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canAgents = canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)
  const { runId } = await params
  const supabase = await createClient()

  const { data: run, error: runError } = await supabase.schema('agent').from('agent_runs')
    .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, parent_run_id, correlation_id, status, input, output, error_code, error_message, started_at, completed_at')
    .eq('id', runId)
    .maybeSingle()

  if (runError) throw new Error(`Unable to load agent run: ${runError.message}`)
  if (!run) notFound()
  if (!await canViewExecutionRun(user.id, run as AgentRun)) notFound()
  try {
    await authorizeAgentAction(
      user.id,
      'execution.view_evidence',
      run.dataset_id
        ? { type: 'DATASET', projectId: run.project_id, datasetId: run.dataset_id }
        : { type: 'PROJECT', projectId: run.project_id },
    )
  } catch {
    notFound()
  }

  const [
    stepsResult,
    logsResult,
    messagesResult,
    artifactsResult,
    agentResult,
    toolsResult,
    checkpointsResult,
    interruptsResult,
    supervisorEventsResult,
  ] = await Promise.all([
    supabase.schema('agent').from('agent_run_steps').select('id, step_name, step_order, status, attempt, input, output, started_at, completed_at, error_code, error_message, created_at').eq('agent_run_id', runId).order('step_order'),
    supabase.schema('agent').from('agent_run_logs').select('id, agent_run_step_id, level, event_type, message, details, created_at').eq('agent_run_id', runId).order('created_at'),
    supabase.schema('agent').from('agent_messages').select('id, source_agent_run_id, target_agent_run_id, message_type, correlation_id, payload, status, created_at, delivered_at, processed_at').or(`source_agent_run_id.eq.${runId},target_agent_run_id.eq.${runId}`).order('created_at'),
    supabase.schema('agent').from('agent_artifacts').select('id, artifact_type, artifact_version, name, payload, storage_uri, content_hash, created_at').eq('agent_run_id', runId).order('created_at'),
    supabase.schema('agent').from('agent_definitions').select('name, agent_key, version').eq('id', run.agent_definition_id).maybeSingle(),
    supabase.schema('agent').from('agent_tool_invocations').select('id, tool_key, tool_version, executor_key, read_only, idempotent, status, input_hash, output_hash, contract_hash, approval_interrupt_id, started_at, completed_at, error_code, error_summary').eq('agent_run_id', runId).order('started_at'),
    supabase.schema('agent').from('agent_run_checkpoints').select('id, checkpoint_seq, checkpoint_kind, state_version, state_hash, step_name, step_order, created_at').eq('agent_run_id', runId).order('checkpoint_seq'),
    supabase.schema('agent').from('agent_run_interrupts').select('id, interrupt_type, status, decision, request_summary, action_key, action_payload_hash, requested_at, expires_at, resolved_at, resumed_at').eq('agent_run_id', runId).order('requested_at'),
    supabase.schema('agent').from('agent_supervisor_events').select('id, event_type, plan_hash, step_id, step_order, agent_key, tool_key, contract_hash, input_hash, output_hash, execution_decision, risk_tier, attempt, detail_code, created_at').eq('agent_run_id', runId).order('created_at'),
  ])

  if (stepsResult.error) throw new Error(`Unable to load run steps: ${stepsResult.error.message}`)
  if (logsResult.error) throw new Error(`Unable to load run logs: ${logsResult.error.message}`)
  if (messagesResult.error) throw new Error(`Unable to load run messages: ${messagesResult.error.message}`)
  if (artifactsResult.error) throw new Error(`Unable to load run artifacts: ${artifactsResult.error.message}`)
  if (agentResult.error) throw new Error(`Unable to load agent definition: ${agentResult.error.message}`)
  if (toolsResult.error) throw new Error(`Unable to load governed tool invocations: ${toolsResult.error.message}`)
  if (checkpointsResult.error) throw new Error(`Unable to load runtime checkpoints: ${checkpointsResult.error.message}`)
  if (interruptsResult.error) throw new Error(`Unable to load runtime interrupts: ${interruptsResult.error.message}`)
  if (supervisorEventsResult.error) throw new Error(`Unable to load supervisor evidence: ${supervisorEventsResult.error.message}`)

  const typedRun = run as AgentRun
  const steps = (stepsResult.data ?? []) as AgentRunStep[]
  const logs = (logsResult.data ?? []) as AgentRunLog[]
  const messages = (messagesResult.data ?? []) as AgentMessage[]
  const artifacts = (artifactsResult.data ?? []) as AgentArtifact[]
  const tools = (toolsResult.data ?? []) as AgentToolInvocation[]
  const checkpoints = (checkpointsResult.data ?? []) as AgentCheckpoint[]
  const interrupts = (interruptsResult.data ?? []) as AgentInterrupt[]
  const supervisorEvents = (supervisorEventsResult.data ?? []) as AgentSupervisorEvent[]
  const agent = agentResult.data

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Agent Run" contextLabel="Execution evidence" homeHref="/home" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canAgents ? <Link href="/agents" className="text-sm underline">← Back to AI Agents</Link> : <span className="text-sm text-muted-foreground">Governed execution evidence</span>}
          <span className="rounded-full border px-3 py-1 text-xs font-medium">{typedRun.status}</span>
        </div>

        <header>
          <h1 className="text-3xl font-semibold">Agent Run</h1>
          <p className="mt-2 break-all text-sm text-muted-foreground">{typedRun.id}</p>
        </header>

        <section className="grid gap-4 rounded-xl border p-6 md:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Agent</p><p className="mt-1 font-medium">{agent ? `${agent.name} v${agent.version}` : 'Unknown agent'}</p></div>
          <div><p className="text-xs text-muted-foreground">Project</p><p className="mt-1 break-all font-medium">{typedRun.project_id}</p></div>
          <div><p className="text-xs text-muted-foreground">Dataset version</p><p className="mt-1 break-all font-medium">{typedRun.dataset_version_id ?? 'Not specified'}</p></div>
          <div><p className="text-xs text-muted-foreground">Started</p><p className="mt-1 font-medium">{formatDate(typedRun.started_at)}</p></div>
        </section>

        {(typedRun.error_code || typedRun.error_message) && (
          <section className="rounded-xl border border-red-200 p-6">
            <h2 className="font-semibold">Execution error</h2>
            {typedRun.error_code && <p className="mt-2 text-sm font-medium">{typedRun.error_code}</p>}
            {typedRun.error_message && <p className="mt-1 text-sm text-muted-foreground">{typedRun.error_message}</p>}
          </section>
        )}

        <section className="rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Execution steps</h2>
          {steps.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No execution steps were recorded.</p> : (
            <div className="mt-4 space-y-4">
              {steps.map((step) => (
                <article key={step.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><span className="mr-2 text-xs text-muted-foreground">Step {step.step_order}</span><span className="font-medium">{step.step_name}</span></div>
                    <span className="rounded-full border px-2 py-1 text-xs">{step.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Attempt {step.attempt} · Started {formatDate(step.started_at)} · Completed {formatDate(step.completed_at)}</p>
                  {step.error_message && <p className="mt-2 text-sm text-muted-foreground">{step.error_message}</p>}
                  <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Input</summary><div className="mt-2"><JsonBlock value={step.input} /></div></details>
                  <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Output</summary><div className="mt-2"><JsonBlock value={step.output} /></div></details>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Run logs</h2>
            <span className="text-xs text-muted-foreground">{logs.length} events</span>
          </div>
          {logs.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No persisted log events were recorded.</p> : (
            <div className="mt-4 space-y-3">
              {logs.map((log) => (
                <article key={log.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><span className="mr-2 rounded-full border px-2 py-1 text-[11px] font-medium">{log.level}</span><span className="font-medium">{log.event_type}</span></div>
                    <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm">{log.message}</p>
                  {log.agent_run_step_id && <p className="mt-1 break-all text-xs text-muted-foreground">Step: {log.agent_run_step_id}</p>}
                  <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Details</summary><div className="mt-2"><JsonBlock value={log.details} /></div></details>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Governed tool invocations</h2><span className="text-xs text-muted-foreground">{tools.length}</span></div>
            {tools.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No governed tool invocations were recorded.</p> : <div className="mt-4 space-y-3">{tools.map(tool => <article key={tool.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-medium">{tool.tool_key} v{tool.tool_version}</span><span className="rounded-full border px-2 py-1 text-xs">{tool.status}</span></div><p className="mt-2 text-xs text-muted-foreground">Executor {tool.executor_key} · {tool.read_only ? 'read-only' : 'side-effecting'} · {tool.idempotent ? 'idempotent' : 'non-idempotent'}</p><p className="mt-2 break-all text-xs text-muted-foreground">Contract {tool.contract_hash}</p><p className="mt-1 break-all text-xs text-muted-foreground">Input {tool.input_hash}{tool.output_hash ? ` · Output ${tool.output_hash}` : ''}</p>{tool.approval_interrupt_id ? <p className="mt-1 break-all text-xs text-muted-foreground">Approval interrupt {tool.approval_interrupt_id}</p> : null}{tool.error_code ? <p className="mt-2 text-sm">{tool.error_code}{tool.error_summary ? `: ${tool.error_summary}` : ''}</p> : null}<p className="mt-2 text-xs text-muted-foreground">Started {formatDate(tool.started_at)} · Completed {formatDate(tool.completed_at)}</p></article>)}</div>}
          </div>
          <div className="rounded-xl border p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Runtime checkpoints</h2><span className="text-xs text-muted-foreground">{checkpoints.length}</span></div>
            {checkpoints.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No runtime checkpoints were recorded.</p> : <div className="mt-4 space-y-3">{checkpoints.map(checkpoint => <article key={checkpoint.id} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><span className="font-medium">#{checkpoint.checkpoint_seq} {checkpoint.checkpoint_kind}</span><span className="text-xs text-muted-foreground">state v{checkpoint.state_version}</span></div><p className="mt-2 text-xs text-muted-foreground">{checkpoint.step_name ? `Step ${checkpoint.step_order ?? '—'} · ${checkpoint.step_name}` : 'Run boundary'}</p><p className="mt-1 break-all text-xs text-muted-foreground">State hash {checkpoint.state_hash}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(checkpoint.created_at)}</p></article>)}</div>}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Approval and runtime interrupts</h2><span className="text-xs text-muted-foreground">{interrupts.length}</span></div>
            {interrupts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No runtime interrupts were recorded.</p> : <div className="mt-4 space-y-3">{interrupts.map(interrupt => <article key={interrupt.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-medium">{interrupt.interrupt_type}</span><span className="rounded-full border px-2 py-1 text-xs">{interrupt.status}</span></div>{interrupt.request_summary ? <p className="mt-2 text-sm">{interrupt.request_summary}</p> : null}<p className="mt-2 text-xs text-muted-foreground">{interrupt.action_key ? `Action ${interrupt.action_key}` : 'No action key'}{interrupt.decision ? ` · Decision ${interrupt.decision}` : ''}</p>{interrupt.action_payload_hash ? <p className="mt-1 break-all text-xs text-muted-foreground">Payload {interrupt.action_payload_hash}</p> : null}<p className="mt-1 text-xs text-muted-foreground">Requested {formatDate(interrupt.requested_at)} · Expires {formatDate(interrupt.expires_at)} · Resolved {formatDate(interrupt.resolved_at)} · Resumed {formatDate(interrupt.resumed_at)}</p></article>)}</div>}
          </div>
          <div className="rounded-xl border p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Supervisor trajectory</h2><span className="text-xs text-muted-foreground">{supervisorEvents.length}</span></div>
            {supervisorEvents.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No supervisor trajectory evidence was recorded.</p> : <div className="mt-4 space-y-3">{supervisorEvents.map(event => <article key={event.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-medium">{event.event_type}</span><span className="text-xs text-muted-foreground">{formatDate(event.created_at)}</span></div><p className="mt-2 text-xs text-muted-foreground">{event.agent_key ? `Agent ${event.agent_key}` : 'Supervisor'}{event.tool_key ? ` · Tool ${event.tool_key}` : ''}{event.step_order ? ` · Step ${event.step_order}` : ''}{event.attempt ? ` · Attempt ${event.attempt}` : ''}</p>{event.execution_decision ? <p className="mt-1 text-xs text-muted-foreground">Decision {event.execution_decision}{event.risk_tier !== null ? ` · Risk tier ${event.risk_tier}` : ''}</p> : null}<p className="mt-1 break-all text-xs text-muted-foreground">Plan {event.plan_hash}</p>{event.detail_code ? <p className="mt-1 text-xs text-muted-foreground">Detail {event.detail_code}</p> : null}</article>)}</div>}
          </div>
        </section>

        <section className="rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Run output</h2>
          <div className="mt-4"><JsonBlock value={typedRun.output} /></div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Messages</h2>
            {messages.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No agent messages were recorded.</p> : <div className="mt-4 space-y-3">{messages.map((message) => <article key={message.id} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><span className="font-medium">{message.message_type}</span><span className="text-xs text-muted-foreground">{message.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(message.created_at)}</p><div className="mt-3"><JsonBlock value={message.payload} /></div></article>)}</div>}
          </div>

          <div className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Artifacts</h2>
            {artifacts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No artifacts were recorded.</p> : <div className="mt-4 space-y-3">{artifacts.map((artifact) => <article key={artifact.id} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><span className="font-medium">{artifact.name}</span><span className="text-xs text-muted-foreground">{artifact.artifact_type} v{artifact.artifact_version}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(artifact.created_at)}{artifact.content_hash ? ` · ${artifact.content_hash}` : ''}</p><div className="mt-3"><JsonBlock value={artifact.payload} /></div>{artifact.storage_uri && <p className="mt-3 break-all text-xs text-muted-foreground">Storage: {artifact.storage_uri}</p>}</article>)}</div>}
          </div>
        </section>
      </div>
    </main>
  )
}
