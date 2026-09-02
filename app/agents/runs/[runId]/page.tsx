import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

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
  await requireUser()
  const { runId } = await params
  const supabase = await createClient()

  const { data: run, error: runError } = await supabase.schema('agent').from('agent_runs')
    .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, parent_run_id, correlation_id, status, input, output, error_code, error_message, started_at, completed_at')
    .eq('id', runId)
    .maybeSingle()

  if (runError) throw new Error(`Unable to load agent run: ${runError.message}`)
  if (!run) return <main className="min-h-screen p-8"><div className="mx-auto max-w-5xl"><Link href="/agents" className="text-sm underline">← Back to AI Agents</Link><section className="mt-8 rounded-xl border p-6"><h1 className="text-xl font-semibold">Agent run not found</h1><p className="mt-2 text-sm text-muted-foreground">The run does not exist or is not accessible in your current project scope.</p></section></div></main>

  const [stepsResult, logsResult, messagesResult, artifactsResult, agentResult] = await Promise.all([
    supabase.schema('agent').from('agent_run_steps').select('id, step_name, step_order, status, attempt, input, output, started_at, completed_at, error_code, error_message, created_at').eq('agent_run_id', runId).order('step_order'),
    supabase.schema('agent').from('agent_run_logs').select('id, agent_run_step_id, level, event_type, message, details, created_at').eq('agent_run_id', runId).order('created_at'),
    supabase.schema('agent').from('agent_messages').select('id, source_agent_run_id, target_agent_run_id, message_type, correlation_id, payload, status, created_at, delivered_at, processed_at').or(`source_agent_run_id.eq.${runId},target_agent_run_id.eq.${runId}`).order('created_at'),
    supabase.schema('agent').from('agent_artifacts').select('id, artifact_type, artifact_version, name, payload, storage_uri, content_hash, created_at').eq('agent_run_id', runId).order('created_at'),
    supabase.schema('agent').from('agent_definitions').select('name, agent_key, version').eq('id', run.agent_definition_id).maybeSingle(),
  ])

  if (stepsResult.error) throw new Error(`Unable to load run steps: ${stepsResult.error.message}`)
  if (logsResult.error) throw new Error(`Unable to load run logs: ${logsResult.error.message}`)
  if (messagesResult.error) throw new Error(`Unable to load run messages: ${messagesResult.error.message}`)
  if (artifactsResult.error) throw new Error(`Unable to load run artifacts: ${artifactsResult.error.message}`)
  if (agentResult.error) throw new Error(`Unable to load agent definition: ${agentResult.error.message}`)

  const typedRun = run as AgentRun
  const steps = (stepsResult.data ?? []) as AgentRunStep[]
  const logs = (logsResult.data ?? []) as AgentRunLog[]
  const messages = (messagesResult.data ?? []) as AgentMessage[]
  const artifacts = (artifactsResult.data ?? []) as AgentArtifact[]
  const agent = agentResult.data

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/agents" className="text-sm underline">← Back to AI Agents</Link>
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
