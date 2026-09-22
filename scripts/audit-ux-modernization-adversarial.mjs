import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const manifest=fs.readFileSync(path.join(root,'docs/ux/DATANEXUS-UX-ALL-PAGES-REVALIDATION.md'),'utf8')

function collectPages(dir){
  const out=[]
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory()) out.push(...collectPages(full))
    else if(entry.name==='page.tsx') out.push(path.relative(root,full).split(path.sep).join('/'))
  }
  return out
}

const pages=collectPages(path.join(root,'app')).sort()
assert.equal(pages.length,79,'Expected the current UX coverage boundary to contain 79 page routes')

const missing=pages.filter(page=>!manifest.includes('`'+page+'`'))
assert.deepEqual(missing,[],'Every page route must remain represented in the UX revalidation manifest')

const modernizationFiles=[
  'app/dashboard/page.tsx',
  'app/inbox/page.tsx',
  'app/search/page.tsx',
  'app/data-quality/page.tsx',
  'app/observability/page.tsx',
  'app/catalog/page.tsx',
  'app/catalog/catalog-manager.tsx',
  'app/profiling/explorer/page.tsx',
  'app/agents/page.tsx',
  'app/agents/run-agent-form.tsx',
  'app/agents/runs/[runId]/page.tsx',
  'app/ai-insights/page.tsx',
  'app/admin/ai-command-center/page.tsx',
]

const violations=[]
for(const file of modernizationFiles){
  const source=fs.readFileSync(path.join(root,file),'utf8')
  if(/#061426|#050b17/.test(source)) violations.push(file+': stale pre-modernization canvas token')
  if(/shadow-\[0_0_(?:2[4-9]|[3-9]\d|\d{3,})px/.test(source)) violations.push(file+': heavy glow shadow')
  const aggressive=[...source.matchAll(/(?:sm|md|lg|xl):grid-cols-(6|7|8|9|10|11|12)/g)]
  for(const match of aggressive){
    const line=source.slice(0,match.index).split('\n').length
    const nearby=source.slice(Math.max(0,(match.index??0)-140),(match.index??0)+180)
    if(!/2xl:grid-cols-/.test(nearby)) violations.push(file+': aggressive pre-2xl grid at line '+line)
  }
}
assert.deepEqual(violations,[], 'Independent modernization audit found layout/palette violations:\n'+violations.join('\n'))

const css=fs.readFileSync(path.join(root,'app/globals.css'),'utf8')
assert.match(css,/:focus-visible/)
assert.match(css,/outline:\s*2px solid rgb\(34 211 238\)/)
assert.match(css,/--dn-shadow-dark/)
assert.match(css,/--dn-shadow-light/)

const authShell=fs.readFileSync(path.join(root,'components/auth/auth-shell.tsx'),'utf8')
assert.match(authShell,/var\(--font-inter\)|Inter|DataNexus AI/)
assert.match(authShell,/Governed intelligence workspace/)

console.log('Independent UX modernization adversarial audit passed for 79-page coverage, responsive density, palette consistency, neomorphic restraint, and explicit focus visibility.')
