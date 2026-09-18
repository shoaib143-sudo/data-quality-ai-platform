import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260918041500_harden_glossary_direct_write_boundary.sql', 'utf8')
const createRoute = fs.readFileSync('app/api/glossary/route.ts', 'utf8')
const itemRoute = fs.readFileSync('app/api/glossary/[termId]/route.ts', 'utf8')
const mappingRoute = fs.readFileSync('app/api/glossary/mappings/route.ts', 'utf8')
const mappingItemRoute = fs.readFileSync('app/api/glossary/mappings/[mappingId]/route.ts', 'utf8')

const required = [
  'revoke insert, update, delete on table governance.glossary_terms from authenticated',
  'revoke insert, update, delete on table governance.glossary_mappings from authenticated',
  'create policy glossary_terms_project_read',
  'create policy glossary_mappings_project_read',
  'for select',
  'to authenticated',
  'grant select on table governance.glossary_terms to authenticated',
  'grant select on table governance.glossary_mappings to authenticated',
]
for (const token of required) {
  if (!migration.toLowerCase().includes(token.toLowerCase())) throw new Error(`Glossary boundary migration missing: ${token}`)
}

if (/for\s+all\s+to\s+authenticated/i.test(migration)) throw new Error('Glossary hardening must not recreate authenticated ALL policies.')
if (/grant\s+(?:[^;]*\b(?:insert|update|delete)\b[^;]*)\s+on\s+table\s+governance\.glossary_(?:terms|mappings)\s+to\s+authenticated/i.test(migration)) {
  throw new Error('Glossary hardening must not grant authenticated direct mutation privileges.')
}

for (const [label, source] of [
  ['glossary create', createRoute],
  ['glossary item', itemRoute],
  ['glossary mapping create', mappingRoute],
  ['glossary mapping item', mappingItemRoute],
]) {
  if (!source.includes("'glossary.manage'")) throw new Error(`${label} route must enforce glossary.manage before mutation.`)
  if (!source.includes('createAdminClient')) throw new Error(`${label} route must use trusted server-side persistence after authorization.`)
}

console.log('Glossary direct-write boundary verified: authenticated Data API is read-only; governed mutations remain capability-gated server actions.')
