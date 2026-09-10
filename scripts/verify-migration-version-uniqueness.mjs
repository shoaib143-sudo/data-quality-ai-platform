import fs from 'node:fs'
import path from 'node:path'

const migrationDir = path.join(process.cwd(), 'supabase', 'migrations')
const legacyPath = path.join(process.cwd(), '.github', 'legacy-migration-version-collisions.json')
const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
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
const unapproved = collisions.filter(([version, names]) => {
  const allowed = legacy[version]
  return !Array.isArray(allowed) || JSON.stringify([...names].sort()) !== JSON.stringify([...allowed].sort())
})
const staleLegacy = Object.entries(legacy).filter(([version, names]) => {
  const actual = byVersion.get(version) ?? []
  return JSON.stringify([...actual].sort()) !== JSON.stringify([...names].sort())
})

if (malformed.length || unapproved.length || staleLegacy.length) {
  if (malformed.length) console.error(`Malformed migration filenames: ${malformed.join(', ')}`)
  for (const [version, names] of unapproved) console.error(`Unapproved migration collision ${version}: ${names.join(', ')}`)
  for (const [version, names] of staleLegacy) console.error(`Legacy collision baseline drift ${version}: expected ${names.join(', ')}`)
  process.exit(1)
}

console.log(`Migration collision verification passed: ${files.length} migrations; ${collisions.length} frozen legacy collision groups; no new collisions.`)
