import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../supabase/migrations/20260909134000_adr006_model_pricing_authority.sql',
);
const sql = readFileSync(migrationPath, 'utf8');
const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

function requires(pattern, message) {
  assert.match(normalized, pattern, message);
}

requires(/create table governance\.ai_model_pricing_versions/, 'pricing version table must exist');
requires(/provider text not null check \( provider = lower\(btrim\(provider\)\)/, 'provider must be stored canonically');
requires(/model_id text not null check \( model_id = btrim\(model_id\)/, 'model identity must be trimmed at the table boundary');
requires(/pricing_version text not null check \( pricing_version = btrim\(pricing_version\)/, 'pricing version must be stored canonically');
requires(/currency text not null check \( currency = upper\(btrim\(currency\)\) and currency ~ '\^\[a-z\]\{3\}\$' \)/, 'currency must be explicit and canonical');
requires(/input_price_per_million_tokens numeric\(24,12\) not null/, 'input price must have an explicit per-million-token unit');
requires(/output_price_per_million_tokens numeric\(24,12\) not null/, 'output price must have an explicit per-million-token unit');
requires(/effective_from timestamptz not null/, 'effective-from authority must be recorded');
requires(/effective_to timestamptz/, 'effective-to authority must be supported');
requires(/source_reference text not null check \( source_reference = btrim\(source_reference\)/, 'pricing source reference must be required and canonical');
requires(/provenance jsonb not null/, 'structured provenance must be retained');
requires(/reviewed_by uuid not null references auth\.users\(id\)/, 'human reviewer identity must be retained');
requires(/reviewer_capability text not null default 'policy\.approve'/, 'review authority must be pinned');
requires(/review_note text not null check \( review_note = btrim\(review_note\)/, 'human review evidence must be required and canonical');
requires(/created_by uuid not null references auth\.users\(id\)/, 'creator identity must be retained');
requires(/unique \(project_id, provider, model_id, currency, pricing_version\)/, 'currency-specific pricing identity must be unique within a project');

requires(/create trigger ai_model_pricing_versions_immutable before update or delete/, 'pricing history must reject mutation');
requires(/raise exception 'ai model pricing versions are append-only'/, 'immutable trigger must reject mutation');
requires(/alter table governance\.ai_model_pricing_versions enable row level security/, 'pricing table must enable RLS');
requires(/create policy ai_model_pricing_versions_read .* to authenticated using \(app_private\.is_project_member\(project_id\)\)/, 'authenticated reads must be project-member scoped');
requires(/revoke all on table governance\.ai_model_pricing_versions from anon, authenticated, service_role/, 'browser and service roles must start with no table privileges');
requires(/grant select on table governance\.ai_model_pricing_versions to authenticated, service_role/, 'pricing evidence may be read but not directly written');

requires(/create or replace view governance\.ai_model_pricing_effective with \(security_invoker = true\)/, 'effective view must preserve caller RLS');
requires(/partition by p\.project_id, p\.provider, p\.model_id, p\.currency/, 'effective selection must be scoped to exact pricing identity');
requires(/order by p\.effective_from desc, p\.created_at desc, p\.id desc/, 'effective selection must be deterministic');
requires(/where p\.effective_from <= now\(\)/, 'future pricing must not become effective early');
requires(/where pricing_rank = 1 and \(effective_to is null or now\(\) < effective_to\)/, 'expired latest pricing must not fall back to stale authority');
requires(/1000000::bigint as price_unit_tokens/, 'effective view must expose the exact pricing denominator');

const publishFunctionOffset = normalized.indexOf('create or replace function governance.publish_ai_model_pricing');
const pricingInsertOffsets = [...normalized.matchAll(/insert into governance\.ai_model_pricing_versions/g)].map((match) => match.index);
assert.ok(publishFunctionOffset >= 0, 'pricing publication RPC must exist');
assert.equal(pricingInsertOffsets.length, 1, 'migration must contain exactly one pricing insert path and no seed data');
assert.ok(pricingInsertOffsets[0] > publishFunctionOffset, 'the only pricing insert must be inside the publication RPC');
requires(/returns uuid language plpgsql security definer/, 'publication RPC must be security definer');
requires(/not governance\.has_project_capability\(p_project_id, p_reviewer, 'policy\.approve'\)/, 'publication must require policy.approve');
requires(/human review note is required/, 'publication must require review evidence');
requires(/pg_advisory_xact_lock/, 'same-identity publication must be transaction-serialized');
requires(/superseded pricing version must have the same project, provider, model, and currency/, 'supersession must preserve exact pricing identity');
requires(/'ai_model_pricing_published'/, 'publication must emit an audit event');
requires(/'pricing_evidence_only_no_runtime_cost_enforcement'/, 'audit semantics must explicitly deny runtime authority');
requires(/revoke all on function governance\.publish_ai_model_pricing\([^)]+\) from public, anon, authenticated/, 'browser roles must not execute publication');
requires(/grant execute on function governance\.publish_ai_model_pricing\([^)]+\) to service_role/, 'only the backend service role may invoke publication');

assert.ok(!normalized.includes('insert into governance.ai_resource_budget'), 'pricing foundation must not mutate resource budgets');
assert.ok(!normalized.includes('update governance.ai_resource_budget'), 'pricing foundation must not activate cost enforcement');
assert.ok(!normalized.includes('usd_per_day'), 'pricing foundation must not claim daily USD enforcement');
assert.ok(!normalized.includes('exchange_rate'), 'pricing foundation must not invent FX semantics');

console.log('model pricing authority verifier: PASS');
