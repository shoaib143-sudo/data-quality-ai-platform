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

requireText('supabase/migrations/20260905052000_governance_knowledge_operational_domains.sql', [
  'governance.regulatory_applicability',
  'governance.accountability_assignments',
  'governance.dataset_certifications',
  'governance.remediation_knowledge',
  'BUSINESS_OWNER',
  'TECHNICAL_OWNER',
  'DATA_STEWARD',
])

requireText('supabase/migrations/20260905053000_governance_knowledge_full_domain_documents.sql', [
  'Business Glossary Operating Guide',
  'GDPR Applicability Reference',
  'Enterprise Data Classification Standard',
  'Data Ownership and Stewardship Standard',
  'Data Contract and SLA Standard',
  'Dataset Certification Standard',
  'Governance Issue and Incident Knowledge Playbook',
  'Remediation Knowledge and Learning Guide',
  'RESTRICTED',
  'CONFIDENTIAL',
])

requireText('supabase/migrations/20260905054000_governance_knowledge_operational_records.sql', [
  'CUSTOMER_EMAIL_VALIDITY',
  'CUST_ID_COMPLETENESS',
  'CUST_ID_UNIQUENESS',
  'Customer Master Data Contract',
  'SYN-CERT-CUSTOMER-MASTER',
  'ROLE:CUSTOMER_DATA_OWNER',
  'ROLE:CUSTOMER_DATA_STEWARD',
])

requireText('supabase/migrations/20260905055000_governance_knowledge_operational_history.sql', [
  'Synthetic historical duplicate customer identifier issue',
  'Synthetic customer freshness delay incident',
  'REM-CUSTOMER-ID-DUPLICATES',
  'REM-RELAX-COMPLETENESS-THRESHOLD',
  "'WORKED'",
  "'FAILED'",
])

requireText('supabase/migrations/20260905056000_governance_data_estate_knowledge_graph.sql', [
  'REGULATION',
  'DRIVES_POLICY',
  'IMPLEMENTED_BY_CONTROL',
  'GOVERNS_TERM',
  'DEFINES_CDE',
  'MAPPED_TO_DATASET',
  'HAS_COLUMN',
  'MONITORED_BY_RULE',
  'ACCOUNTABLE_TO',
  'STEWARDED_BY',
  'traverse_knowledge_graph',
  'p_max_depth',
  'dedup',
])

requireText('lib/governance/semantic-knowledge-indexer.ts', [
  'KNOWLEDGE_DOCUMENT',
  'KNOWLEDGE_REQUIREMENT',
  'CRITICAL_DATA_ELEMENT',
  'DATA_CONTRACT',
  'CERTIFICATION',
  'REMEDIATION_KNOWLEDGE',
  'ACCOUNTABILITY_ASSIGNMENT',
  'REGULATORY_APPLICABILITY',
  'CLASSIFICATION',
  'reindexProjectKnowledgeSemanticObjects',
  'deleteSemanticObject',
])

requireText('lib/governance/semantic-job-worker.ts', [
  'reindexProjectKnowledgeSemanticObjects',
  'knowledge.indexed',
  'knowledge.failed',
  'knowledge.pruned',
])

requireText('app/api/governance/knowledge/search/route.ts', [
  "authorizeProject(user.id, projectId, 'glossary.read')",
  'search_governance_knowledge_lexical',
  'KNOWLEDGE_DOCUMENT',
  'KNOWLEDGE_REQUIREMENT',
  'CRITICAL_DATA_ELEMENT',
  'NOT_CONFIGURED',
])

requireText('app/api/governance/knowledge/graph/route.ts', [
  "authorizeProject(user.id, projectId, 'lineage.read')",
  'traverse_knowledge_graph',
  'anchorType',
  'maxEdges',
  'nodeCount',
  'edgeCount',
])

requireText('docs/GOVERNANCE_KNOWLEDGE_BOOTSTRAP.md', [
  'synthetic_bootstrap=true',
  'Operationalized knowledge domains',
  'Data Estate Knowledge Graph',
  'REGULATION:EXT-REG-GDPR',
  'DQ_RULE:CUSTOMER_EMAIL_VALIDITY',
  'Human approval remains required',
])

requireText('docs/AI_GOVERNANCE_INTELLIGENCE_ROADMAP.md', [
  'Governance Knowledge',
  'Critical Data Element',
  'Observe → Understand → Reason → Recommend → Govern → Act → Verify → Learn',
])

console.log('Governance knowledge model contracts verified.')
