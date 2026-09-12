import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [layout,compat,glossary,classification,stewardship] = await Promise.all([
  readFile(new URL('../app/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/legacy-dark-compat.css', import.meta.url),'utf8'),
  readFile(new URL('../app/glossary/page.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/classification/page.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/stewardship/page.tsx', import.meta.url),'utf8'),
])

assert.ok(layout.indexOf("import './legacy-dark-compat.css'") > layout.indexOf("import './globals.css'"), 'Legacy compatibility CSS must load after Tailwind/global layers.')
for (const [name,source] of Object.entries({glossary,classification,stewardship})) {
  assert.match(source,/min-h-screen bg-slate-50/,`${name} must remain covered by the scoped legacy bridge.`)
  assert.match(source,/bg-white/,`${name} must contain a legacy light surface exercised by the bridge.`)
}
assert.match(compat,/main\.min-h-screen\.bg-slate-50 \.bg-white[\s\S]*background-color: #0a1d33/,'Legacy white surfaces must be converted to the dark governed surface.')
assert.match(compat,/text-slate-500[\s\S]*color: rgb\(148 163 184\)/,'Muted legacy copy must use the accessible dark-surface token.')
assert.match(compat,/text-blue-600[\s\S]*color: rgb\(147 197 253\)/,'Legacy blue links must be raised to a dark-surface readable token.')

function channel(value){const c=value/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}
function luminance(hex){const n=Number.parseInt(hex.slice(1),16);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
assert.ok(contrast('#f1f5f9','#0a1d33')>=4.5,'Primary text must meet WCAG AA normal-text contrast.')
assert.ok(contrast('#94a3b8','#0a1d33')>=4.5,'Muted text must meet WCAG AA normal-text contrast.')
assert.ok(contrast('#93c5fd','#0a1d33')>=4.5,'Legacy blue links must meet WCAG AA normal-text contrast.')
assert.ok(contrast('#c4b5fd','#0a1d33')>=4.5,'Legacy violet links must meet WCAG AA normal-text contrast.')

console.log('legacy dark contrast contract: PASS')
