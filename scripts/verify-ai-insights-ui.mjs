import fs from 'node:fs'

const page = fs.readFileSync('app/ai-insights/page.tsx', 'utf8')

function requireText(needle, label) {
  if (!page.includes(needle)) throw new Error(`AI Insights UI contract missing: ${label}`)
}

requireText("schema('governance').from('data_quality_investigations')", 'DQ investigation evidence')
requireText("schema('governance').from('governance_risk_predictions')", 'predictive risk evidence')
requireText("schema('governance').from('ai_governance_suggestions')", 'governance suggestion evidence')
requireText("schema('profiling').from('quality_rule_definitions')", 'pending quality control evidence')
requireText("schema('profiling').from('profile_findings')", 'deterministic profiling evidence')
requireText('These are AI suggestions, not governance authority.', 'AI advisory truth boundary')
requireText('truthful empty state', 'non-fabrication empty state')
requireText('remain disabled until governed approval', 'human approval boundary')

console.log('AI Insights UI evidence contract verified.')
