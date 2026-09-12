import fs from 'node:fs'

const sql=fs.readFileSync('supabase/migrations/20260912070000_project_governance_activation.sql','utf8')
const required=[
  'governance.verify_project_governance_activation(p_project_id uuid)',
  "d.status::text='ACTIVE'",
  "s.status='ACTIVE' and s.target_state='CURRENT' and s.subject_state='CURRENT'",
  "c.status='APPROVED' and c.authority_state='AUTHORITATIVE' and c.target_state='CURRENT'",
  "g.mapping_status='APPROVED' and g.approved=true and g.validation_state='VALID'",
  "c.status='APPROVED'",
  "c.status='ACTIVE'",
  "c.certification_status='CERTIFIED'",
  '(c.valid_from is null or c.valid_from<=now())',
  '(c.valid_until is null or c.valid_until>now())',
  'PROPOSALS_NEVER_COUNT_AS_EFFECTIVE_GOVERNANCE',
  'PROJECT_ACTIVATION_REQUIRES_EVERY_ACTIVE_DATASET_TO_SATISFY_ALL_CORE_GOVERNANCE_DOMAINS',
  'fully_core_governed=s.active_datasets',
  'PROJECT_GOVERNANCE_ACTIVATED',
  'PROJECT_GOVERNANCE_PARTIAL',
  'PROJECT_GOVERNANCE_NOT_ACTIVATED',
  'INCOMPLETE_STEWARDSHIP_COVERAGE',
  'INCOMPLETE_AUTHORITATIVE_CLASSIFICATION_COVERAGE',
  'INCOMPLETE_APPROVED_GLOSSARY_COVERAGE',
  'INCOMPLETE_APPROVED_CDE_COVERAGE',
  'INCOMPLETE_ACTIVE_CONTRACT_COVERAGE',
  'INCOMPLETE_ACTIVE_CERTIFICATION_COVERAGE',
  'security invoker'
]
for(const marker of required){if(!sql.includes(marker)) throw new Error(`Governance activation contract missing: ${marker}`)}
if(/insert\s+into|update\s+governance\.|delete\s+from/i.test(sql)) throw new Error('Governance activation verifier must remain read-only')
if(/grant\s+execute[^;]+\b(public|anon)\b/i.test(sql)) throw new Error('Anonymous governance activation execution must remain revoked')
console.log('Project governance activation contract verified: full active-dataset core coverage is required; proposals remain non-effective.')
