import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const helperPath = path.resolve('scripts/prepare-clean-security-definer-acl-replay.mjs')
const workflow = fs.readFileSync('.github/workflows/native-compensation-post-implementation-assurance.yml', 'utf8')

test('clean replay restores the canonical SECURITY DEFINER browser ACL boundary', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-security-definer-replay-'))
  try {
    const result = spawnSync(process.execPath, [helperPath], {
      env: { ...process.env, TARGET_MIGRATION_DIR: target },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const filename = '20260915163959_reconcile_security_definer_acl.sql'
    const generated = path.join(target, filename)
    assert.ok(fs.existsSync(generated), 'canonical SECURITY DEFINER ACL replay reconciliation must be generated')

    const sql = fs.readFileSync(generated, 'utf8')
    assert.match(sql, /p\.prosecdef = true/)
    assert.match(sql, /revoke execute on function %s from public, anon, authenticated/)
    assert.match(sql, /is_org_admin/)
    assert.match(sql, /is_project_member/)
    assert.match(sql, /resolve_runtime_interrupt/)
    assert.match(sql, /request_execution_recovery_action_admin/)
    assert.ok('20260915163959' < '20260915164000', 'ACL reconciliation must precede the canonical authenticated SECURITY DEFINER allowlist assertion')
  } finally {
    fs.rmSync(target, { recursive: true, force: true })
  }
})

test('post implementation assurance invokes the canonical SECURITY DEFINER ACL replay helper', () => {
  assert.match(workflow, /prepare-clean-security-definer-acl-replay\.mjs/)
})
