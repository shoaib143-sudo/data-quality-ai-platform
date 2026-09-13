import fs from 'node:fs'
import assert from 'node:assert/strict'

const route=fs.readFileSync('app/api/admin/persona-test-principals/route.ts','utf8')
const page=fs.readFileSync('app/admin/persona-test-principals/page.tsx','utf8')

assert.match(route,/export async function POST\(request: Request\)/,'provisioning must use POST')
assert.doesNotMatch(route,/export async function GET\(/,'credential rotation must not be exposed as GET')
assert.match(route,/authorization\.role !== 'OWNER'/,'provisioning must remain OWNER-only')
assert.match(route,/execute !== EXECUTE_TOKEN/,'provisioning must require explicit execution confirmation')
assert.match(route,/Cache-Control': 'private, no-store, max-age=0'/,'credential response must remain no-store')
assert.match(page,/method:'POST'/,'admin page must call provisioning with POST')
assert.match(page,/Rotate 13 persona test credentials/,'admin page must require an explicit user action')
assert.doesNotMatch(page,/useEffect/,'admin page must not rotate credentials on mount')
assert.doesNotMatch(page,/persona-test-principals\?projectId=/,'execution token must not be placed in a mutating GET URL')

console.log('persona test principal provisioning boundary: PASS')
