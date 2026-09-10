import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260902015029'
const name = 'align_agent_execution_status_values'
const replayPath = path.join(targetDir, `${version}_${name}.sql`)

if (fs.existsSync(replayPath)) {
  throw new Error(`Clean replay already contains ${path.basename(replayPath)}; remove the replay-only recovery when released history contains the canonical migration`)
}

const sql = `alter type agent.run_status add value if not exists 'SUCCEEDED';
alter type agent.step_status add value if not exists 'SUCCEEDED';
`

fs.writeFileSync(replayPath, sql)
console.log(`RECONSTRUCTED ${path.basename(replayPath)}: production migration history added SUCCEEDED to agent.run_status and agent.step_status before later capability-matrix SQL references that value; the migration is absent from released Git history.`)
