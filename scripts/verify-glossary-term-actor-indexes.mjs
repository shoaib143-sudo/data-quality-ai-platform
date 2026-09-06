import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907103000_harden_glossary_term_actor_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'glossary_terms_approved_by_fk_idx',
  'glossary_terms_last_changed_by_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required glossary term actor FK index: ${index}`)
}

const clauses = [
  'on governance.glossary_terms (approved_by)',
  'on governance.glossary_terms (last_changed_by)',
]
for (const clause of clauses) {
  if (!sql.includes(clause)) throw new Error(`Missing exact glossary term actor FK coverage: ${clause}`)
}

if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Glossary term actor FK hardening must be additive and non-destructive')
}

console.log('Glossary term actor FK index contract verified without changing glossary approval authority.')
