import fs from 'node:fs'

const page = fs.readFileSync('app/ai-capabilities/page.tsx', 'utf8')

function requireText(needle, label) {
  if (!page.includes(needle)) throw new Error(`AI capability dashboard contract missing: ${label}`)
}

requireText("rpc('generate_ai_capability_matrix'", 'live matrix RPC')
requireText("authorizeProject(user.id, selectedProjectId, 'catalog.read')", 'project authorization')
requireText("neq('source_kind', 'SYNTHETIC')", 'enterprise knowledge authority boundary')
requireText("eq('review_status', 'APPROVED')", 'approved governance corpus boundary')
requireText('BOOTSTRAP_ONLY', 'bootstrap-only state')
requireText('DATA_PENDING', 'data-pending state')
requireText('NOT_EVIDENCED', 'not-evidenced state')
requireText('It does not mean the capability executes on every dataset', 'capability execution truth boundary')
requireText('rather than pretending synthetic knowledge is enterprise authority', 'non-fabrication knowledge boundary')

console.log('Operational AI capability dashboard contract verified.')
