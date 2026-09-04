import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing governance knowledge artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing governance knowledge contract: ${pattern}`)
  }
}

requireText('supabase/migrations/20260905050000_governance_knowledge_model_core.sql', [
  'governance.knowledge_documents',
  'governance.knowledge_requirements',
  'governance.critical_data_elements',
  'governance.cde_mappings',
  'governance.knowledge_relationships',
  'search_governance_knowledge_lexical',
  'enable row level security',
  'catalog.update',
])

requireText('supabase/migrations/20260905051000_governance_knowledge_synthetic_bootstrap.sql', [
  'synthetic_bootstrap',
  'Enterprise Personal Data Governance Policy',
  'Customer Master Data Quality Standard',
  'Critical Data Element Management Standard',
  'Data Retention and Lifecycle Procedure',
  'Customer Email Address',
  'CUSTOMER_EMAIL',
  'KNOWLEDGE_BOOTSTRAP',
  'human_approval_required',
])

requireText('lib/governance/semantic-knowledge-indexer.ts', [
  'KNOWLEDGE_DOCUMENT',
  'KNOWLEDGE_REQUIREMENT',
  'CRITICAL_DATA_ELEMENT',
  'reindexProjectKnowledgeSemanticObjects',
  'deleteSemanticObject',
])

requireText('lib/governance/semantic-job-worker.ts', [
  'reindexProjectKnowledgeSemanticObjects',
  'knowledge.indexed',
  'knowledge.failed',
  'knowledge.pruned',
])

requireText('docs/AI_GOVERNANCE_INTELLIGENCE_ROADMAP.md', [
  'Governance Knowledge',
  'Critical Data Element',
  'Observe → Understand → Reason → Recommend → Govern → Act → Verify → Learn',
])

console.log('Governance knowledge model contracts verified.')
