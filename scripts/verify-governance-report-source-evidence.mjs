import fs from 'node:fs'

const route = fs.readFileSync('app/api/reports/governance/route.ts', 'utf8')
const page = fs.readFileSync('app/reports/page.tsx', 'utf8')
const manager = fs.readFileSync('app/reports/report-manager.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Governance report source evidence contract missing: ${label}`)
}

requireText(route, "from('source_operational_readiness')", 'report consumes governed source readiness projection')
requireText(route, "from('jdbc_discovery_evidence')", 'report consumes governed JDBC evidence projection')
requireText(route, 'source_evidence:sourceEvidence', 'JSON contains complete project source evidence')
requireText(route, 'data_source_id:dataset.data_source_id??null', 'dataset rows preserve exact source binding')
requireText(route, 'source_operational_state', 'CSV dataset rows expose operational evidence')
requireText(route, 'jdbc_repeat_scan_stable', 'CSV dataset rows expose repeat-scan evidence')
requireText(route, 'DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE', 'source lifecycle authority semantic')
requireText(route, 'OBSERVED_JDBC_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_CONFIGURATION', 'JDBC configuration authority semantic')
requireText(route, 'catalog.verify_jdbc_source_acceptance', 'JDBC acceptance authority remains explicit')
requireText(route, "eventType:'GOVERNANCE_REPORT_EXPORTED'", 'report export remains audited')

requireText(page, "from('source_operational_readiness')", 'report landing page consumes readiness projection')
requireText(page, "from('jdbc_discovery_evidence')", 'report landing page consumes JDBC projection')
requireText(manager, 'One row per governed dataset', 'CSV grain remains dataset-level')
requireText(manager, 'Configured sources without governed datasets remain visible here.', 'JSON retains unbound configured sources')
requireText(manager, 'Observation evidence never mutates source configuration', 'operator truth boundary is visible')
requireText(manager, 'JDBC acceptance authority remains catalog.verify_jdbc_source_acceptance', 'operator acceptance boundary is visible')

const forbidden = [
  /connection_ref/i,
  /jdbc_bridge_token/i,
  /password/i,
  /credential/i,
]
for (const pattern of forbidden) {
  if (pattern.test(route)) throw new Error(`Governance report source evidence exposes forbidden connection material pattern: ${pattern}`)
}

console.log('Governed report source evidence contract verified.')
