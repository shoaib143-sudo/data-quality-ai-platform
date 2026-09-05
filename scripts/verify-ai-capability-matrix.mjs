import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260905121000_generate_ai_capability_matrix.sql', 'utf8')
const baseline = fs.readFileSync('Major discussion/2026-08-28-ai-capability-matrix.md', 'utf8')
const route = fs.readFileSync('app/api/governance/ai-capability-matrix/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`AI capability matrix contract missing: ${label}`)
}

const migrationIds = [...migration.matchAll(/\((\d+),'[^']+','[^']+'\)/g)].map(match => Number(match[1]))
const uniqueIds = [...new Set(migrationIds)].sort((a, b) => a - b)
if (uniqueIds.length !== 75 || uniqueIds[0] !== 1 || uniqueIds.at(-1) !== 75) {
  throw new Error(`AI capability matrix must contain exactly capability IDs 1..75; found ${uniqueIds.length}`)
}
for (let id = 1; id <= 75; id += 1) {
  if (!uniqueIds.includes(id)) throw new Error(`AI capability matrix missing capability ${id}`)
}

const baselineRows = [...baseline.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(match => Number(match[1]))
if (baselineRows.length !== 75) throw new Error(`Strategic AI capability baseline must contain 75 rows; found ${baselineRows.length}`)

requireText(migration, 'governance.generate_ai_capability_matrix', 'production capability matrix RPC')
requireText(migration, "'EVIDENCED'", 'live evidence state')
requireText(migration, "'DATA_PENDING'", 'real data pending state')
requireText(migration, "'BOOTSTRAP_ONLY'", 'bootstrap governance truth state')
requireText(migration, "'NOT_EVIDENCED'", 'missing live evidence state')
requireText(migration, 'governance.lineage_column_mappings', 'real field lineage evidence source')
requireText(migration, "source_kind<>'SYNTHETIC' and review_status='APPROVED'", 'enterprise governance corpus authority boundary')
requireText(migration, 'security invoker', 'invoker security boundary')
requireText(migration, 'revoke all on function governance.generate_ai_capability_matrix(uuid) from public, anon, authenticated', 'direct client execution revocation')
requireText(migration, 'grant execute on function governance.generate_ai_capability_matrix(uuid) to service_role', 'service-only execution grant')
requireText(route, 'requireUser()', 'authenticated Matrix API')
requireText(route, "authorizeProject(user.id, projectId, 'catalog.read')", 'project authorization')
requireText(route, "schema('governance').rpc('generate_ai_capability_matrix'", 'service-side Matrix RPC')
requireText(route, 'capabilityCount: matrix.length', 'reported capability cardinality')

console.log('Evidence-backed 75 capability matrix contract verified.')
