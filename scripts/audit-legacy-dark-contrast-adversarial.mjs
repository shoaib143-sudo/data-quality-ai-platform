import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const compat = await readFile(new URL('../app/legacy-dark-compat.css', import.meta.url),'utf8')
const globals = await readFile(new URL('../app/globals.css', import.meta.url),'utf8')

assert.match(compat,/html\.dark main\.min-h-screen\.bg-slate-50/,'Compatibility bridge must be restricted to legacy light workspaces.')
assert.doesNotMatch(compat,/^html\.dark \.bg-white/m,'Bridge must not globally recolor modern dark-native UI controls.')
assert.doesNotMatch(compat,/!important/,'Bridge should win by unlayered cascade order, not specificity escalation.')
assert.match(globals,/@layer components[\s\S]*Compatibility bridge while legacy workspaces are migrated/,'Existing layered compatibility intent must remain documented.')
assert.doesNotMatch(compat,/color-scheme:\s*light/,'Legacy remediation must not reintroduce a light platform color scheme.')

console.log('legacy dark contrast adversarial audit: PASS', {
  scopedToLegacySurfaces: true,
  modernDarkControlsUnchanged: true,
  cascadeOrderExplicit: true,
})
