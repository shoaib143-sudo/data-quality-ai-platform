import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name)
    return entry.isDirectory()?walk(full):[full.replaceAll(path.sep,'/')]
  })
}

const pages=walk('app').filter(file=>file.endsWith('/page.tsx')||file==='app/page.tsx').sort()
const uncovered=[]
for(const file of pages){
  const source=fs.readFileSync(file,'utf8')
  if(intentionalExceptions.has(file)) continue
  if(!source.includes('<GlobalUtilityBar')||!source.includes('id="main-content"')||!source.includes('tabIndex={-1}')) uncovered.push(file)
}
assert.deepEqual(uncovered,[],`Authenticated product pages outside the shared shell: ${uncovered.join(', ')}`)

const personaLanding=fs.readFileSync('app/home/[persona]/page.tsx','utf8')
const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(personaLanding.includes('<RoleLandingPage'), 'Persona home exception must continue to use the specialized RoleLandingPage')
assert.ok(roleLanding.includes('id="main-content"')&&roleLanding.includes('tabIndex={-1}'), 'Specialized persona landing must preserve its focusable main target')
assert.ok(roleLanding.includes('canAccessWorkspaceHref'), 'Specialized persona landing navigation must remain workspace-policy constrained')

assert.equal(intentionalExceptions.size,10,'Exception inventory must stay explicit and reviewable')
console.log(`Residual Product Shell inventory passed across ${pages.length} pages with ${intentionalExceptions.size} intentional special-route exceptions.`)
