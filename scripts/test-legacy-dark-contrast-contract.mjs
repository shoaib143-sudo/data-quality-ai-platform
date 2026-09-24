import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const [layout,compat] = await Promise.all([
  readFile(new URL('../app/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/legacy-dark-compat.css', import.meta.url),'utf8'),
])

assert.ok(layout.indexOf("import './legacy-dark-compat.css'") > layout.indexOf("import './globals.css'"), 'Legacy compatibility CSS must load after Tailwind/global layers.')

function collectPages(dir){
  const out=[]
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory()) out.push(...collectPages(full))
    else if(entry.name==='page.tsx') out.push(full)
  }
  return out
}

const legacyPages=collectPages(path.join(process.cwd(),'app')).filter(file=>{
  const source=fs.readFileSync(file,'utf8')
  return /min-h-screen bg-(?:slate|gray)-50/.test(source)
})

assert.match(compat,/html\.dark main\.min-h-screen\.bg-slate-50/,'Legacy bridge must remain scoped to light workspace roots while migration is incomplete.')
assert.match(compat,/main\.min-h-screen\.bg-slate-50 \.bg-white[\s\S]*background-color: #102036/,'Legacy white surfaces must map to the modernized governed surface.')
assert.match(compat,/text-slate-500[\s\S]*color: rgb\(148 163 184\)/,'Muted legacy copy must retain the accessible dark-surface token.')
assert.match(compat,/text-blue-600[\s\S]*color: rgb\(147 197 253\)/,'Legacy blue links must retain a dark-surface readable token.')
assert.doesNotMatch(compat,/background-color: #0a1d33/,'Legacy bridge must not regress to the retired pre-modernization panel color.')

for(const file of legacyPages){
  const source=fs.readFileSync(file,'utf8')
  assert.match(source,/min-h-screen bg-(?:slate|gray)-50/,path.relative(process.cwd(),file)+' must remain within the scoped bridge until migrated.')
}

function channel(value){const c=value/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}
function luminance(hex){const n=Number.parseInt(hex.slice(1),16);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}

for(const [name,foreground] of [
  ['Primary text','#f1f5f9'],
  ['Muted text','#94a3b8'],
  ['Legacy blue links','#93c5fd'],
  ['Legacy violet links','#c4b5fd'],
]){
  assert.ok(contrast(foreground,'#102036')>=4.5,`${name} must meet WCAG AA normal-text contrast on the modernized legacy surface.`)
}

console.log('legacy dark contrast contract: PASS', {legacyPageCount:legacyPages.length, modernizedPanel:'#102036'})
