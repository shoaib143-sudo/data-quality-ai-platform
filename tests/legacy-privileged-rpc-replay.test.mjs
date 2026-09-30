import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const helperPath = path.resolve('scripts/prepare-clean-migration-replay.mjs')

test('clean replay restores privileged RPC execute revokes before security-definer validation', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-privileged-rpc-replay-'))
  try {
    const result = spawnSync(process.execPath, [helperPath], {
      env: {
        ...process.env,
        SOURCE_MIGRATION_DIR: path.resolve('supabase/migrations'),
        TARGET_MIGRATION_DIR: target,
      },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const filename = '20260911050539_reconstruct_legacy_privileged_rpc_execute_revokes.sql'
    const generated = path.join(target, filename)
    assert.ok(fs.existsSync(generated), 'privileged RPC replay hardening must be generated before the allowlist checkpoint')

    const sql = fs.readFileSync(generated, 'utf8')
    for (const invariant of [
      'revoke all on function profiling.get_dataset_execution_source(uuid) from public, anon, authenticated',
      'revoke all on function public.create_file_dataset(uuid,text,text,text,text) from public, anon, authenticated',
      'revoke all on function public.create_organization(text,text) from public, anon, authenticated',
      'revoke all on function public.create_project(uuid,text,text,text) from public, anon, authenticated',
    ]) assert.ok(sql.includes(invariant), `missing replay execute-revoke invariant: ${invariant}`)

    assert.ok('20260911050539' < '20260911050541', 'execute revokes must precede the historical cleanup that reaches the allowlist validation')
  } finally {
    fs.rmSync(target, { recursive: true, force: true })
  }
})
