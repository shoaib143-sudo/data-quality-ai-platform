import fs from 'node:fs'

const route = fs.readFileSync('app/api/governance/retrieval-benchmark/route.ts', 'utf8')
const runner = fs.readFileSync('lib/ai/governance-retrieval-benchmark.ts', 'utf8')
const failures = []
const requireText = (source, token, label) => { if (!source.includes(token)) failures.push(`missing ${label}: ${token}`) }

requireText(route, 'export async function POST(request: Request)', 'benchmark POST surface')
requireText(route, 'requireUser()', 'authenticated benchmark execution')
requireText(route, "authorizeProject(user.id, projectId, 'admin.manage')", 'project admin authorization')
requireText(route, 'runGovernanceRetrievalBenchmark({ projectId', 'governed benchmark boundary')
requireText(route, 'k must be an integer between 1 and 100', 'bounded benchmark depth')
requireText(route, 'No governed retrieval relevance labels are available', 'fail-closed no-label response')
requireText(route, '{ accepted: true, result }', 'evidence receipt response')

requireText(runner, 'buildGovernanceRetrievalEvaluationDataset(projectId)', 'canonical governed label source')
requireText(runner, 'createGovernanceRetrievalProvider(supabase)', 'production retrieval and reranker composition')
requireText(runner, 'createGovernanceEvaluationEngine()', 'canonical evaluation persistence')

for (const forbidden of [
  /export\s+async\s+function\s+(GET|PUT|PATCH|DELETE)\b/,
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /\b(approve|activate|promote|deploy)\s*\(/i,
  /lifecycle_status\s*[:=]/i,
]) if (forbidden.test(route)) failures.push(`forbidden benchmark API pattern: ${forbidden}`)

if (failures.length) {
  console.error('ADR-006 retrieval benchmark API contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('ADR-006 governed retrieval benchmark API authority boundaries verified.')
