import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const surfaces=[
  ['Trace Timeline','app/admin/ai-command-center/traces/page.tsx'],
  ['Retrieval Evaluation','app/admin/ai-command-center/retrieval-evaluation/page.tsx'],
  ['Agent Detail','app/agents/[agentKey]/[version]/page.tsx'],
  ['Agent Run','app/agents/runs/[runId]/page.tsx'],
  ['Autonomous Governance','app/agents/autonomous-governance/page.tsx'],
  ['AI Insights','app/ai-insights/page.tsx'],
  ['Edit Dataset','app/datasets/dataset/[datasetId]/edit/page.tsx'],
  ['Edit Connection','app/datasets/edit/[sourceId]/page.tsx'],
  ['Administration','app/admin/page.tsx'],
]

for(const [label,file] of surfaces){
  const source=fs.readFileSync(file,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

const admin=fs.readFileSync('app/admin/page.tsx','utf8')
assert.ok(!admin.includes('<nav className='), 'Administration must not retain its legacy duplicate brand shell')

const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(roleLanding.includes('id="main-content"'), 'Persona home must retain its own focusable main target')
assert.ok(roleLanding.includes('tabIndex={-1}'), 'Persona home main target must remain focusable')
assert.ok(roleLanding.includes('canAccessWorkspaceHref'), 'Persona home must retain safe persona-route filtering')
assert.ok(roleLanding.includes('aria-label="Persona workspace"'), 'Persona home must retain its purpose-built persona navigation')
assert.ok(!roleLanding.includes('<GlobalUtilityBar'), 'Persona home is an intentional custom-shell exception and must not receive a duplicate global shell')

const intentionalExceptions=new Map([
  ['app/page.tsx','root authentication redirect'],
  ['app/access-denied/page.tsx','standalone authorization failure surface'],
  ['app/approvals/external/[token]/page.tsx','token-scoped external approval surface'],
  ['app/forgot-password/page.tsx','standalone authentication recovery surface'],
  ['app/home/[persona]/page.tsx','specialized persona landing rendered by RoleLandingPage'],
  ['app/home/page.tsx','authenticated persona redirect'],
  ['app/home/unavailable/page.tsx','standalone unavailable-state surface'],
  ['app/login/page.tsx','standalone authentication surface'],
  ['app/reset-password/page.tsx','standalone authentication recovery surface'],
  ['app/signup/page.tsx','standalone authentication surface'],
])

const boundaryScreens=[
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/forgot-password/page.tsx',
  'app/reset-password/page.tsx',
  'app/home/unavailable/page.tsx',
  'app/access-denied/page.tsx',
  'app/approvals/external/[token]/page.tsx',
]
for(const file of boundaryScreens){
  const source=fs.readFileSync(file,'utf8')
  assert.ok(source.includes('id="main-content"'), `Boundary screen ${file} must expose the shared skip target`)
  assert.ok(source.includes('tabIndex={-1}'), `Boundary screen ${file} main target must be focusable`)
  assert.ok(!source.includes('<GlobalUtilityBar'), `Boundary screen ${file} must not receive the authenticated Product Shell`)
}

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name)
    return entry.isDirectory()?walk(full):[full.replaceAll(path.sep,'/')]
  })
}

const pages=walk('app').filter(file=>file.endsWith('/page.tsx')||file==='app/page.tsx').sort()
const uncovered=[]
for(const file of pages){
  if(intentionalExceptions.has(file)) continue
  const source=fs.readFileSync(file,'utf8')
  if(!source.includes('<GlobalUtilityBar')||!source.includes('id="main-content"')||!source.includes('tabIndex={-1}')) uncovered.push(file)
}
assert.deepEqual(uncovered,[],`Authenticated product pages outside the shared shell: ${uncovered.join(', ')}`)
assert.equal(intentionalExceptions.size,10,'Special-purpose exception inventory must remain explicit and reviewable')

const personaLanding=fs.readFileSync('app/home/[persona]/page.tsx','utf8')
assert.ok(personaLanding.includes('<RoleLandingPage'), 'Persona home exception must continue to use the specialized RoleLandingPage')

console.log(`Wave 13 residual Product Shell inventory passed across ${pages.length} pages with ${intentionalExceptions.size} intentional special-purpose exceptions.`)
