import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/telemetry-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-telemetry-provider.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260908144850_add_ai_telemetry_provider_ledger.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`TelemetryProvider contract missing: ${label}`)
}

requireText(provider, 'export interface TelemetryProvider', 'stable telemetry provider interface')
requireText(provider, "readonly id: string", 'provider identity')
requireText(provider, 'record(event: TelemetryEvent)', 'record operation')
requireText(provider, "'INFO' | 'SUCCESS' | 'ERROR'", 'bounded status vocabulary')
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

if (/grant\s+insert[^;]+authenticated/i.test(migration)) {
  throw new Error('Authenticated clients must not receive direct telemetry insert authority.')
}

console.log('ADR-006 TelemetryProvider contract verified.')
