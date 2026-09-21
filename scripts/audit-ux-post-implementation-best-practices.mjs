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
for(const file of pages){
  const source=fs.readFileSync(file,'utf8')
  if(intentionalExceptions.has(file)) continue
  assert.ok(source.includes('<GlobalUtilityBar'), `best-practice: ${file} must use the shared utility shell`)
  assert.ok(source.includes('id="main-content"'), `best-practice: ${file} must expose a semantic primary-content target`)
  assert.ok(source.includes('tabIndex={-1}'), `best-practice: ${file} primary-content target must be programmatically focusable`)
}

const utility=fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')
const skip=fs.readFileSync('components/app-shell/skip-to-content.tsx','utf8')
const skipIndex=utility.indexOf('<SkipToContent targetId="workspace-content-start" />')
const headerIndex=utility.indexOf('<header')
const targetIndex=utility.indexOf('<div id="workspace-content-start"')
assert.ok(skipIndex>=0 && headerIndex>skipIndex && targetIndex>headerIndex,'best-practice: skip control must precede repeated navigation and land after it')
assert.ok(utility.includes('aria-label="Primary"'),'best-practice: repeated primary navigation must expose a navigation label')
assert.ok(utility.includes('focus-visible:ring-2'),'best-practice: shared navigation must preserve a visible keyboard focus indicator')
assert.ok(skip.includes('focus:not-sr-only') && skip.includes('focus:fixed'),'best-practice: skip control must become visible and operable on focus')

const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(roleLanding.includes('id="main-content"')&&roleLanding.includes('tabIndex={-1}'),'best-practice: specialized persona landing must preserve a focusable main target')
assert.ok(roleLanding.includes('canAccessWorkspaceHref'),'best-practice: specialized persona navigation must stay policy constrained')
assert.ok(roleLanding.includes('focus-visible:ring-2'),'best-practice: specialized persona landing must retain visible focus styles')

assert.equal(intentionalExceptions.size,10,'best-practice: special-route exceptions must remain explicit and reviewable')
console.log(`Post-implementation UX best-practice audit passed across ${pages.length} app pages.`)
