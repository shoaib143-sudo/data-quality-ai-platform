import fs from 'node:fs'
import path from 'node:path'

const migrationDir = path.join(process.cwd(), 'supabase', 'migrations')
const files = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()

const byVersion = new Map()
const malformed = []
for (const file of files) {
  const match = file.match(/^(\d{14})_[a-z0-9_]+\.sql$/)
  if (!match) {
    malformed.push(file)
    continue
  }
  const version = match[1]
  const existing = byVersion.get(version) ?? []
  existing.push(file)
  byVersion.set(version, existing)
}

const collisions = [...byVersion.entries()].filter(([, names]) => names.length > 1)
if (malformed.length || collisions.length) {
  if (malformed.length) console.error(`Malformed migration filenames: ${malformed.join(', ')}`)
  for (const [version, names] of collisions) console.error(`Duplicate migration version ${version}: ${names.join(', ')}`)
  process.exit(1)
}

console.log(`Migration version verification passed: ${files.length} unique timestamped migrations.`)
