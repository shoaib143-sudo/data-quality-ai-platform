import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')

const fileName = '20260905121000_generate_ai_capability_matrix.sql'
const targetPath = path.join(targetDir, fileName)
if (!fs.existsSync(targetPath)) throw new Error(`Replay target is missing ${fileName}`)

const source = fs.readFileSync(targetPath, 'utf8')
const broken = "status in ('COMPLETED','SUCCEEDED')"
const repaired = "status::text in ('COMPLETED','SUCCEEDED')"

const occurrences = source.split(broken).length - 1
if (occurrences !== 1) {
  throw new Error(`Expected exactly one historical agent.run_status compatibility site in ${fileName}, found ${occurrences}`)
}

fs.writeFileSync(targetPath, source.replace(broken, repaired))
console.log(`REPAIRED ${fileName}: compared agent.run_status as text so disposable replay compiles before the later SUCCEEDED enum value exists; released migration history remains unchanged.`)
