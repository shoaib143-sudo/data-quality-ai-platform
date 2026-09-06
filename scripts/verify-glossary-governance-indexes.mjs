import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906160200_harden_glossary_governance_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'glossary_mapping_decisions_term_fk_idx',
  'glossary_mappings_discovered_asset_fk_idx',
  'glossary_mappings_proposed_by_fk_idx',
  'glossary_mappings_reviewed_by_fk_idx',
  'glossary_mappings_last_changed_by_fk_idx',
]

for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required glossary FK index: ${index}`)
}

const requiredColumns = [
  'on governance.glossary_mapping_decisions (term_id)',
  'on governance.glossary_mappings (discovered_asset_id)',
  'on governance.glossary_mappings (proposed_by)',
  'on governance.glossary_mappings (reviewed_by)',
  'on governance.glossary_mappings (last_changed_by)',
]
for (const clause of requiredColumns) {
  if (!sql.includes(clause)) throw new Error(`Missing exact glossary FK coverage: ${clause}`)
}

if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Glossary FK hardening must be additive and non-destructive')
}

console.log('Glossary governance FK index contract verified without changing glossary authority.')
