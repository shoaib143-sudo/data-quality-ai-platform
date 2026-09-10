import { readFile } from 'node:fs/promises'

const migration = await readFile('supabase/migrations/20260910102000_adr006_canonical_ai_cost_accounting.sql', 'utf8')
const contract = await readFile('lib/ai/cost-accounting.ts', 'utf8')
const provider = await readFile('lib/ai/governance-cost-accounting.ts', 'utf8')
const observable = await readFile('lib/ai/observable-intelligent-router.ts', 'utf8')
const governedRouter = await readFile('lib/ai/governance-intelligent-router.ts', 'utf8')

const checks = [
  [migration, /Reuses governance\.ai_model_pricing_versions, the existing governed pricing authority/, 'existing governed pricing authority is reused'],
  [migration, /create table if not exists governance\.ai_model_cost_events/, 'canonical cost event ledger'],
  [migration, /invocation_id uuid not null unique/, 'idempotent invocation identity'],
  [migration, /pricing_version_id uuid references governance\.ai_model_pricing_versions\(id\)/, 'cost evidence references governed pricing version'],
  [migration, /accounting_status text not null[\s\S]*PRICED[\s\S]*USAGE_UNAVAILABLE[\s\S]*PRICE_UNAVAILABLE/, 'explicit accounting states'],
  [migration, /AI model cost events are immutable audit evidence/, 'immutable cost evidence'],
  [migration, /record_ai_model_cost_event\([\s\S]*security definer/, 'server-side accounting RPC'],
  [migration, /p\.project_id = p_project_id[\s\S]*p\.provider = lower\(btrim\(p_provider_id\)\)[\s\S]*p\.model_id = btrim\(p_model_name\)/, 'pricing resolution is project/provider/model scoped'],
  [migration, /p\.effective_from <= p_observed_at[\s\S]*p\.effective_to is null or p\.effective_to > p_observed_at/, 'pricing resolution uses effective interval'],
  [migration, /p_input_tokens::numeric \/ 1000000::numeric[\s\S]*input_price_per_million_tokens/, 'database-side input cost calculation'],
  [migration, /p_output_tokens::numeric \/ 1000000::numeric[\s\S]*output_price_per_million_tokens/, 'database-side output cost calculation'],
  [migration, /p_input_tokens is null or p_output_tokens is null[\s\S]*USAGE_UNAVAILABLE/, 'missing observed usage is explicit'],
  [migration, /pricing_matches = 0[\s\S]*PRICE_UNAVAILABLE/, 'missing pricing is explicit'],
  [migration, /pricing_matches > 1[\s\S]*Ambiguous effective AI model pricing/, 'ambiguous pricing fails closed'],
  [migration, /revoke all on table governance\.ai_model_cost_events from public, anon, authenticated/, 'cost ledger client mutation denied'],
  [migration, /grant execute on function governance\.record_ai_model_cost_event[\s\S]*to service_role/, 'accounting RPC server-only'],
  [contract, /ModelCostAccountingStatus = 'PRICED' \| 'USAGE_UNAVAILABLE' \| 'PRICE_UNAVAILABLE'/, 'typed accounting status contract'],
  [contract, /must never estimate token usage or substitute default prices/, 'no-estimation contract'],
  [provider, /rpc\('record_ai_model_cost_event'/, 'governance provider uses canonical RPC'],
  [provider, /usage\?\.inputTokens[\s\S]*usage\?\.outputTokens[\s\S]*usage\?\.totalTokens/, 'provider passes observed usage only'],
  [observable, /randomUUID\(\)/, 'unique model invocation identity generated before accounting'],
  [observable, /costAccounting\.recordInvocation\([\s\S]*providerId: result\.provider[\s\S]*modelName: result\.model[\s\S]*usage: result\.usage/, 'completed provider result is canonically accounted'],
  [observable, /canonical_total_cost: costEvidence\?\.totalCost/, 'canonical cost linked into telemetry evidence'],
  [governedRouter, /createGovernanceModelCostAccountingProvider\(\)/, 'governed router requires canonical cost accounting'],
]

for (const [source, pattern, label] of checks) {
  if (!pattern.test(source)) throw new Error(`ADR-006 cost accounting verification failed: ${label}`)
  console.log(`PASS ${label}`)
}

if (/create table if not exists governance\.ai_model_pricing_versions/i.test(migration)) {
  throw new Error('ADR-006 cost accounting verification failed: canonical cost migration must not redefine the governed pricing authority')
}

const pricingInsertStatements = migration.match(/insert\s+into\s+governance\.ai_model_pricing_versions/gi) ?? []
if (pricingInsertStatements.length !== 0) {
  throw new Error('ADR-006 cost accounting verification failed: migration must not seed unverified model prices')
}
console.log('PASS no governed pricing authority redefinition or invented prices')

if (/estimated[_ ]cost|default[_ ]price|fallback[_ ]price/i.test(provider + observable)) {
  throw new Error('ADR-006 cost accounting verification failed: application code contains estimated/default price behavior')
}
console.log('PASS application path contains no estimated/default price fallback')

console.log('ADR-006 canonical AI cost accounting verification completed.')
