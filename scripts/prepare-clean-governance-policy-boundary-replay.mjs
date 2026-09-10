import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260905045959'
const filename = `${version}_reconcile_governance_knowledge_policy_boundary.sql`
const target = path.join(targetDir, filename)
if (fs.existsSync(target)) throw new Error(`Replay helper already exists: ${filename}`)
if (fs.readdirSync(targetDir).some((name) => name.startsWith(`${version}_`))) {
  throw new Error(`Replay helper version collides with existing migration ${version}`)
}

const tables = [
  'knowledge_documents',
  'knowledge_requirements',
  'critical_data_elements',
  'cde_mappings',
  'knowledge_relationships',
]
const suffixes = ['project_read', 'project_insert', 'project_update', 'project_delete']

const statements = []
for (const table of tables) {
  for (const suffix of suffixes) {
    statements.push(`drop policy if exists ${table}_${suffix} on governance.${table};`)
  }
}

fs.writeFileSync(target, `${statements.join('\n')}\n`)
console.log(`RECONSTRUCTED ${filename}: recovered live governance knowledge history creates project policies before the repository's later duplicate core migration; replay drops only those policy names at the original boundary so the released migration recreates them normally.`)
