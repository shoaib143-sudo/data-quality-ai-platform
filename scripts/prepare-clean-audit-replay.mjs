import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const fileName = '20260904022959_reconstruct_audit_events.sql'
const targetPath = path.join(targetDir, fileName)
if (fs.existsSync(targetPath)) throw new Error(`Replay audit reconstruction already exists: ${fileName}`)

const sql = `begin;

create table if not exists governance.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  actor_user_id uuid,
  actor_type text not null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

commit;
`

fs.writeFileSync(targetPath, sql)
console.log(`RECONSTRUCTED ${fileName}: released history enables and writes governance.audit_events before its recorded creation; replay restores the pre-hash-chain live contract.`)
