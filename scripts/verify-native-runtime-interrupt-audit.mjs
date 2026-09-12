import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration = readFileSync('supabase/migrations/20260912052000_native_runtime_interrupt_lifecycle.sql', 'utf8')
assert.match(migration, /agent_run_interrupt_terminal_actions_append_only/)
assert.match(migration, /agent_run_interrupt_late_decisions_append_only/)
assert.match(migration, /late decisions/i)
console.log('native runtime interrupt audit verification passed')
