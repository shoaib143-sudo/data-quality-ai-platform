import fs from 'node:fs'

const contract = fs.readFileSync('lib/ai/retrieval-label-recorder.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-retrieval-label-recorder.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/retrieval-relevance/route.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260909011755_adr006_atomic_human_retrieval_label_recording.sql', 'utf8')

const failures = []
const requireText = (source, token, label) => { if (!source.includes(token)) failures.push(`missing ${label}: ${token}`) }

requireText(contract, 'export interface RetrievalLabelRecorder', 'stable recorder contract')
requireText(contract, "reviewerCapability: 'admin.manage'", 'conservative reviewer capability')
requireText(contract, 'judgments requires at least one positive relevance judgment', 'positive relevance guard')
requireText(contract, 'duplicate relevance judgment', 'duplicate object-key guard')

requireText(adapter, "rpc('record_human_retrieval_relevance_case'", 'atomic persistence RPC')
requireText(adapter, "authority: 'HUMAN_REVIEWED'", 'human-reviewed authority receipt')
requireText(adapter, 'normalizeHumanRetrievalRelevanceCase(input)', 'application validation boundary')

requireText(route, 'export async function POST(request: Request)', 'authenticated write surface')
requireText(route, 'requireUser()', 'authenticated reviewer identity')
requireText(route, "authorizeProject(user.id, projectId, 'admin.manage')", 'project admin authorization')
requireText(route, 'reviewerUserId: user.id', 'reviewer identity sourced from session')
requireText(route, "reviewerCapability: 'admin.manage'", 'review capability pinned by server')
requireText(route, 'createGovernanceRetrievalLabelRecorder()', 'recorder boundary usage')

requireText(migration, 'create or replace function governance.record_human_retrieval_relevance_case', 'atomic database function')
requireText(migration, 'security definer', 'service function execution context')
requireText(migration, "set search_path = ''", 'locked function search path')
requireText(migration, "'HUMAN_REVIEWED'", 'human-reviewed canonical authority')
requireText(migration, 'RETRIEVAL_LABEL_POSITIVE_JUDGMENT_REQUIRED', 'database positive judgment guard')
requireText(migration, 'revoke all on function governance.record_human_retrieval_relevance_case', 'explicit execute revocation')
requireText(migration, 'from authenticated', 'authenticated execution revoked')
requireText(migration, 'grant execute on function governance.record_human_retrieval_relevance_case', 'service role grant')
requireText(migration, 'to service_role', 'service-role-only execution')
requireText(migration, 'grants no model approval, activation, promotion, or deployment authority', 'authority boundary comment')

for (const forbidden of [
  /reviewerUserId:\s*text\(body/i,
  /reviewer_user_id:\s*text\(body/i,
  /reviewerCapability:\s*text\(body/i,
  /reviewer_capability:\s*text\(body/i,
  /policy\.approve/,
  /\.from\(['"]ai_retrieval_evaluation_case_versions['"]\)\s*\n?\s*\.insert/i,
  /\.from\(['"]ai_retrieval_relevance_judgments['"]\)\s*\n?\s*\.insert/i,
]) if (forbidden.test(route)) failures.push(`forbidden route authority/persistence pattern: ${forbidden}`)

if (/grant\s+execute[\s\S]+to\s+authenticated/i.test(migration)) failures.push('authenticated role must not execute atomic label recorder RPC directly')
if (/export\s+async\s+function\s+(PUT|PATCH|DELETE)\b/.test(route)) failures.push('retrieval relevance recorder route must expose POST only')

if (failures.length) {
  console.error('ADR-006 human retrieval label recorder contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('ADR-006 human retrieval label recorder authority boundaries verified.')
