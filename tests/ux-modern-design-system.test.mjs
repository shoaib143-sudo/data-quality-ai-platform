import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const layout = fs.readFileSync('app/layout.tsx','utf8')
const css = fs.readFileSync('app/globals.css','utf8')
const legacy = fs.readFileSync('app/legacy-dark-compat.css','utf8')
const utility = fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')

test('Inter is the authoritative application typeface', () => {
  assert.match(layout, /import \{ Inter \} from 'next\/font\/google'/)
  assert.match(layout, /--font-inter/)
  assert.match(css, /--font-sans: var\(--font-inter\)/)
})

test('shared UX foundation uses mild neomorphic semantic surfaces', () => {
  for (const marker of ['--dn-canvas-soft','--dn-panel-soft','--dn-shadow-dark','--dn-shadow-light','.dn-surface','.dn-inset','.dn-kpi','.dn-smart-grid']) {
    assert.ok(css.includes(marker), 'Missing design-system marker: ' + marker)
  }
  assert.match(css, /Global density normalization/)
  assert.match(css, /Mild neomorphic compatibility/)
  assert.match(legacy, /Modernized mild-neomorphic compatibility/)
})

test('keyboard focus remains explicit instead of relying on shadow depth', () => {
  assert.match(css, /:focus-visible/)
  assert.match(css, /outline: 2px solid rgb\(34 211 238\)/)
  assert.match(css, /outline-offset: 2px/)
})

test('global navigation names the AI workspace directly', () => {
  assert.match(utility, /label: 'AI Agents'/)
  assert.doesNotMatch(utility, /label: 'Automation'/)
})
