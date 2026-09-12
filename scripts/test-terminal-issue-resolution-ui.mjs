import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ui = await readFile(new URL('../app/issues/issue-manager.tsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../app/api/issues/[issueId]/route.ts', import.meta.url), 'utf8')

assert.match(ui, /const terminal = \['RESOLVED', 'CLOSED'\]\.includes\(issue\.status\)/, 'Issue cards must identify both terminal statuses.')
assert.match(ui, /\{!terminal \? <div[^>]*>[\s\S]*?Resolve with evidence[\s\S]*?<\/div> : null\}/, 'Resolve-with-evidence UI must be hidden for terminal issues.')
assert.match(ui, /placeholder="Add comment"/, 'Terminal-state fix must preserve issue comments.')
assert.match(ui, /<option>RESOLVED<\/option><option>CLOSED<\/option>/, 'Explicit lifecycle controls must remain available to authorized managers.')
assert.match(api, /const ISSUE_STATUSES = new Set\(\['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED'\]\)/, 'API status vocabulary must remain authoritative.')
assert.match(api, /if \(!ISSUE_STATUSES\.has\(status\)\)/, 'Unknown issue states must remain rejected server-side.')

console.log('terminal issue resolution UI contract: PASS')
