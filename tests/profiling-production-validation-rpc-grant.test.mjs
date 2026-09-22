import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260922140000_grant_service_role_profiling_validation_rpc.sql', import.meta.url),
  'utf8',
)

test('production profiling validation RPC is executable only by the server-side service role', () => {
  assert.match(
    migration,
    /revoke execute on function profiling\.validate_metric_execution_contract\(uuid\)\s+from public, anon, authenticated;/,
  )
  assert.match(
    migration,
    /grant execute on function profiling\.validate_metric_execution_contract\(uuid\)\s+to service_role;/,
  )
  assert.match(
    migration,
    /has_function_privilege\(\s*'service_role',\s*'profiling\.validate_metric_execution_contract\(uuid\)',\s*'EXECUTE'/,
  )
  assert.match(
    migration,
    /has_function_privilege\(\s*'anon',\s*'profiling\.validate_metric_execution_contract\(uuid\)',\s*'EXECUTE'/,
  )
  assert.match(
    migration,
    /has_function_privilege\(\s*'authenticated',\s*'profiling\.validate_metric_execution_contract\(uuid\)',\s*'EXECUTE'/,
  )
})
