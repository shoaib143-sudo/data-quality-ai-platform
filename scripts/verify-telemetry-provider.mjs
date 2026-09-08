import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/telemetry-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-telemetry-provider.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260908144850_add_ai_telemetry_provider_ledger.sql', 'utf8')
const traceMigration = fs.readFileSync('supabase/migrations/20260908221146_add_opentelemetry_trace_context_to_ai_telemetry.sql', 'utf8')
const observableRouter = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const intelligentRouter = fs.readFileSync('lib/ai/intelligent-router.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`TelemetryProvider contract missing: ${label}`)
}

requireText(provider, 'export interface TelemetryProvider', 'stable telemetry provider interface')
requireText(provider, "readonly id: string", 'provider identity')
requireText(provider, 'record(event: TelemetryEvent)', 'record operation')
requireText(provider, "'INFO' | 'SUCCESS' | 'ERROR'", 'bounded status vocabulary')
requireText(provider, 'export type TelemetryTraceContext', 'replaceable W3C/OpenTelemetry trace context')
requireText(provider, 'traceId: string', 'trace identifier')
requireText(provider, 'spanId?: string | null', 'span identifier')
requireText(provider, 'parentSpanId?: string | null', 'parent span identifier')
requireText(provider, 'traceFlags?: string | null', 'trace flags')
requireText(provider, 'tracestate?: string | null', 'W3C tracestate')
requireText(provider, 'TRACE_ID_PATTERN', 'trace id validation')
requireText(provider, 'SPAN_ID_PATTERN', 'span id validation')
requireText(provider, 'TRACE_FLAGS_PATTERN', 'trace flags validation')
requireText(provider, 'latencyMs', 'latency measurement')
requireText(provider, 'inputTokens', 'input token accounting')
requireText(provider, 'outputTokens', 'output token accounting')
requireText(provider, 'costUsd', 'cost accounting')
requireText(provider, 'FORBIDDEN_ATTRIBUTE_KEYS', 'sensitive payload guard')
requireText(provider, 'chainofthought', 'hidden reasoning guard')
requireText(provider, 'rawinput', 'raw input guard')
requireText(provider, 'rawoutput', 'raw output guard')
requireText(adapter, 'createAdminClient', 'server-side privileged persistence')
requireText(adapter, "schema('governance')", 'governance schema persistence')
requireText(adapter, "from('ai_telemetry_events')", 'canonical telemetry ledger persistence')
requireText(migration, 'create table governance.ai_telemetry_events', 'canonical PostgreSQL telemetry ledger')
requireText(migration, 'enable row level security', 'RLS enabled')
requireText(migration, 'app_private.is_project_member(project_id)', 'project-scoped authenticated read')
requireText(migration, 'grant select, insert on governance.ai_telemetry_events to service_role', 'service-role-only runtime write grant')
requireText(migration, 'not prompts, completions, or hidden chain-of-thought', 'database truth boundary comment')
requireText(traceMigration, 'add column if not exists trace_id text null', 'canonical trace id column')
requireText(traceMigration, 'add column if not exists span_id text null', 'canonical span id column')
requireText(traceMigration, 'ai_telemetry_events_trace_context_coherence_check', 'trace context coherence guard')
requireText(traceMigration, 'ai_telemetry_events_project_trace_idx', 'project-scoped trace lookup index')
requireText(traceMigration, 'Observability evidence only; never governance authority.', 'trace authority boundary')
requireText(intelligentRouter, 'traceContext?: TelemetryTraceContext | null', 'optional routing trace propagation contract')
requireText(observableRouter, 'traceContext: context.traceContext ?? null', 'route-decision trace persistence')
requireText(observableRouter, 'Telemetry is observability evidence, not routing authority.', 'telemetry cannot change routing authority')

if (/grant\s+insert[^;]+authenticated/i.test(migration)) {
  throw new Error('Authenticated clients must not receive direct telemetry insert authority.')
}
if (/grant\s+(insert|update|delete)[^;]+authenticated/i.test(traceMigration)) {
  throw new Error('Trace-context migration must not expand authenticated telemetry mutation authority.')
}
if (/prompt|completion|chain[-_ ]?of[-_ ]?thought/i.test(traceMigration.replace(/No prompts, completions, or hidden reasoning payloads\./g, ''))) {
  throw new Error('Trace-context schema must not persist prompt, completion, or hidden reasoning payload fields.')
}

console.log('ADR-006 TelemetryProvider contract verified.')
