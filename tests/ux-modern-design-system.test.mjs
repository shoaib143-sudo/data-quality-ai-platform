import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const layout = fs.readFileSync('app/layout.tsx','utf8')
const css = fs.readFileSync('app/globals.css','utf8')
const legacy = fs.readFileSync('app/legacy-dark-compat.css','utf8')
const utility = fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')
const rail = fs.readFileSync('components/app-shell/workspace-rail.tsx','utf8')
const navigation = fs.readFileSync('components/app-shell/workspace-navigation.ts','utf8')

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

test('motion and form-control targets degrade accessibly', () => {
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation-duration: 0\.01ms !important/)
  assert.match(css, /transition-duration: 0\.01ms !important/)
  assert.match(css, /:where\(button,input,select,textarea\)/)
  assert.match(css, /min-height: 2\.25rem/)
  assert.match(css, /scroll-padding-top: 6rem/)
  assert.doesNotMatch(css, /background: #050b17/)
})

test('global navigation names the AI workspace directly', () => {
  assert.match(navigation, /shortLabel: 'AI Agents'/)
  assert.doesNotMatch(navigation, /shortLabel: 'Automation'/)
  assert.match(utility, /workspaceNavItems/)
})


function relativeLuminance([r,g,b]) {
  const convert = value => {
    const channel=value/255
    return channel <= 0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4
  }
  const [R,G,B]=[r,g,b].map(convert)
  return 0.2126*R + 0.7152*G + 0.0722*B
}

function contrastRatio(a,b) {
  const [high,low]=[relativeLuminance(a),relativeLuminance(b)].sort((x,y)=>y-x)
  return (high+0.05)/(low+0.05)
}

test('modernized palette preserves readable text and focus contrast', () => {
  const canvas=[11,20,34]
  const panel=[16,30,48]
  const primaryText=[241,245,249]
  const mutedText=[148,163,184]
  const focus=[34,211,238]

  assert.ok(contrastRatio(primaryText,canvas) >= 4.5)
  assert.ok(contrastRatio(mutedText,panel) >= 4.5)
  assert.ok(contrastRatio(focus,canvas) >= 3)
  assert.match(css, /--dn-canvas: 11 20 34/)
  assert.match(css, /--dn-panel: 16 30 48/)
  assert.match(css, /color: rgb\(241 245 249\)/)
})


test('Dashboard V3 navigation shares one route registry and current-page contract', () => {
  assert.match(rail, /workspaceNavItems/)
  assert.match(utility, /workspaceNavItems/)
  assert.match(navigation, /Data catalog/)
  assert.match(navigation, /AI agents/)
  assert.match(navigation, /Administration/)
  assert.match(rail, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(utility, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(utility, /searchActive/)
  assert.match(utility, /inboxActive/)
})

test('Dashboard V3 active matching and touch navigation stay accessible', () => {
  assert.match(navigation, /if \(href === '\/dashboard'\) return pathname === href/)
  assert.match(navigation, /pathname\.startsWith/)
  assert.match(rail, /aria-haspopup="menu"/)
  assert.match(rail, /role="menu"/)
  assert.match(rail, /role="menuitem"/)
  assert.match(css, /Dashboard V3 navigation hardening/)
  assert.match(css, /@media \(pointer: coarse\)/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /\.dn-topbar-link\.is-active/)
})
