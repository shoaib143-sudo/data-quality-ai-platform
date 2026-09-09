import fs from 'node:fs'

const layout = fs.readFileSync('app/admin/ai-command-center/layout.tsx', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/retrieval-evaluation/page.tsx', 'utf8')
const failures = []
const requireText = (source, token, label) => { if (!source.includes(token)) failures.push(`missing ${label}: ${token}`) }

requireText(layout, '/admin/ai-command-center/retrieval-evaluation', 'retrieval evaluation navigation')
requireText(page, 'Relevance Labels & Benchmark Readiness', 'readiness page heading')
requireText(page, "authorizeProject(user.id, selectedProjectId, 'admin.manage')", 'project admin authorization')
requireText(page, "from('ai_retrieval_evaluation_case_effective')", 'canonical effective relevance cases')
requireText(page, "from('ai_retrieval_relevance_judgments')", 'canonical relevance judgments')
requireText(page, "from('ai_evaluation_results')", 'canonical evaluation ledger')
requireText(page, ".eq('evaluation_type', 'RETRIEVAL_RELEVANCE')", 'retrieval evaluation filter')
requireText(page, "benchmarkReady ? 'READY' : 'BLOCKED'", 'evidence-based readiness indicator')
requireText(page, 'No canonical retrieval relevance cases are recorded', 'truthful no-label state')
requireText(page, 'Neither automatically selects, promotes, activates, deploys, or approves', 'authority boundary')

for (const forbidden of [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /fetch\s*\(/,
  /method\s*:\s*['"]POST['"]/,
  /createAdminClient/,
  /runGovernanceRetrievalBenchmark/,
  /recordHumanReviewedCase/,
]) if (forbidden.test(page)) failures.push(`forbidden Command Center mutation/execution pattern: ${forbidden}`)

if (failures.length) {
  console.error('ADR-006 retrieval evaluation Command Center contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('ADR-006 retrieval evaluation Command Center read-only boundary verified.')
