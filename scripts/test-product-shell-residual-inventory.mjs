import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const intentionalExceptions=new Set([
  'app/page.tsx',
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/forgot-password/page.tsx',
  'app/reset-password/page.tsx',
  'app/access-denied/page.tsx',
  'app/approvals/external/[token]/page.tsx',
  'app/home/page.tsx',
  'app/home/unavailable/page.tsx',
])

function collect(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name)
    return entry.isDirectory()?collect(full):[full.replaceAll('\\','/')]
  })
}

const pages=collect('app').filter(file=>file.endsWith('/page.tsx')||file==='app/page.tsx')
const failures=[]
for(const page of pages){
  if(intentionalExceptions.has(page)) continue
  const source=fs.readFileSync(page,'utf8')
  const sharedShell=source.includes('<GlobalUtilityBar')
  const delegatedPersonaShell=page==='app/home/[persona]/page.tsx' && source.includes('<RoleLandingPage')
  if(!sharedShell && !delegatedPersonaShell) failures.push(page)
  if(sharedShell){
    assert.ok(source.includes('id="main-content"'), `${page} shared-shell page must expose main-content`)
    assert.ok(source.includes('tabIndex={-1}'), `${page} shared-shell page main-content must be focusable`)
  }
}

const persona=fs.readFileSync('app/home/[persona]/page.tsx','utf8')
const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(persona.includes('<RoleLandingPage'), 'persona home must delegate to RoleLandingPage')
assert.ok(roleLanding.includes('id="main-content"') && roleLanding.includes('tabIndex={-1}'), 'RoleLandingPage must retain focusable main-content')

assert.deepEqual(failures,[],`Authenticated product pages missing shared/delegated shell: ${failures.join(', ')}`)
console.log(`Product Shell residual inventory passed for ${pages.length} app pages.`)
