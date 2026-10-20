import assert from 'node:assert/strict'
import fs from 'node:fs'

const catalog = fs.readFileSync(new URL('../lib/governance/agent-action-catalog.ts', import.meta.url), 'utf8')
const historical = fs.readFileSync(new URL('../supabase/migrations/20260916120000_governed_direct_approval_authority_assignment.sql', import.meta.url), 'utf8')
const forward = fs.readFileSync(new URL('../supabase/migrations/20261001090000_learning_promotion_approval_authority_action.sql', import.meta.url), 'utf8')

assert.match(catalog, /PROMOTE_LEARNING_CANDIDATE/)
assert.match(catalog, /PROMOTE_LEARNING_CANDIDATE:[\s\S]*capability:\s*'agent\.admin'[\s\S]*materialProductionMutation:\s*true[\s\S]*financialImpact:\s*'HIGH'[\s\S]*reversibility:\s*'REVERSIBLE'/)

assert.doesNotMatch(historical, /PROMOTE_LEARNING_CANDIDATE/)
assert.match(forward, /PROMOTE_LEARNING_CANDIDATE/g)
assert.match(forward, /assign_agent_approval_authority/)
assert.match(forward, /Administrators cannot assign direct approval authority to themselves/)
assert.match(forward, /same individual cannot hold overlapping Business and Governance authority/)
assert.match(forward, /Overlapping direct approval authority|overlapping direct approval authority/i)
assert.match(forward, /pg_advisory_xact_lock/)

// The repair must permit explicit governed assignment only; it must never seed or
// implicitly inherit promotion authority.
const functionStart = forward.indexOf('create or replace function governance.assign_agent_approval_authority(')
const functionEnd = forward.indexOf('revoke all on function governance.assign_agent_approval_authority', functionStart)
assert.ok(functionStart > 0 && functionEnd > functionStart)
const outsideFunction = forward.slice(0, functionStart) + forward.slice(functionEnd)
const functionBody = forward.slice(functionStart, functionEnd)

// No top-level seed/update may grant promotion authority. The governed function
// is expected to insert one row from caller-supplied, validated v_actions.
assert.doesNotMatch(outsideFunction, /insert\s+into\s+governance\.agent_approval_authorities/i)
assert.doesNotMatch(outsideFunction, /update\s+governance\.agent_approval_authorities/i)
assert.match(functionBody, /insert\s+into\s+governance\.agent_approval_authorities/i)
assert.match(functionBody, /v_actions/)
assert.doesNotMatch(functionBody, /values\s*\([\s\S]{0,1000}PROMOTE_LEARNING_CANDIDATE/i)
assert.doesNotMatch(forward, /alter\s+column\s+action_keys\s+set\s+default[\s\S]*PROMOTE_LEARNING_CANDIDATE/i)

// The historical default remains the compatibility default and intentionally does
// not include learning promotion.
const defaultMatch = historical.match(/add column if not exists action_keys[\s\S]*?default array\[([\s\S]*?)\]::text\[\]/)
assert.ok(defaultMatch)
assert.doesNotMatch(defaultMatch[1], /PROMOTE_LEARNING_CANDIDATE/)

console.log('Learning promotion authority contract is explicitly assignable, dual-axis protected, and never auto-granted')
