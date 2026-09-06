import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906154000_harden_catalog_source_policy_capability_fk_indexes.sql', 'utf8')

const requiredIndexes = [
  ['source_deletion_policies_project_fk_idx', 'catalog.source_deletion_policies (project_id)'],
  ['source_discovery_capabilities_project_fk_idx', 'catalog.source_discovery_capabilities (project_id)'],
]

for (const [name, target] of requiredIndexes) {
  if (!migration.includes(`create index if not exists ${name}`)) throw new Error(`Missing catalog source control index: ${name}`)
  if (!migration.includes(`on ${target}`)) throw new Error(`Catalog source control index ${name} does not cover expected FK target ${target}`)
}

for (const forbidden of [/drop\s+index/i, /drop\s+table/i, /alter\s+table[\s\S]*drop/i, /create\s+unique\s+index/i]) {
  if (forbidden.test(migration)) throw new Error(`Catalog source control index migration contains destructive or authority-changing SQL: ${forbidden}`)
}

console.log(`Catalog source policy/capability FK index hardening verified: ${requiredIndexes.length} targeted covering indexes.`)
