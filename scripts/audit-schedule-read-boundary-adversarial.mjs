import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const route=await readFile(new URL('../app/api/schedules/route.ts',import.meta.url),'utf8')
const manager=await readFile(new URL('../app/schedules/schedule-manager.tsx',import.meta.url),'utf8')
assert.match(route,/projectId=new URL\(request\.url\)\.searchParams\.get\('projectId'\)/)
assert.match(route,/authorizeProject\(user\.id,projectId,'schedule\.manage'\)/)
assert.match(route,/\.eq\('project_id',projectId\)/)
assert.match(manager,/\/api\/schedules\?projectId=\$\{encodeURIComponent\(targetProjectId\)\}/)
assert.match(manager,/visibleSchedules=schedules\.filter\(schedule=>schedule\.project_id===projectId\)/)
console.log('schedule read boundary adversarial audit: PASS')
