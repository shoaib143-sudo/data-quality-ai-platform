import fs from 'node:fs'

const css = fs.readFileSync('app/globals.css', 'utf8')
const bar = fs.readFileSync('components/app-shell/global-utility-bar.tsx', 'utf8')
const profile = fs.readFileSync('components/app-shell/profile-menu.tsx', 'utf8')

const checks = [
  ['global dark canvas', css.includes('#061426') && css.includes('.dn-page')],
  ['shared surface primitive', css.includes('.dn-surface') && css.includes('.dn-inset')],
  ['shared top bar primitive', css.includes('.dn-topbar') && bar.includes('dn-topbar')],
  ['shared control primitive', css.includes('.dn-control') && bar.includes('dn-control')],
  ['cyan focus treatment', css.includes('rgb(34 211 238)') && bar.includes('focus-visible:ring-cyan-400')],
  ['profile menu follows dark navy theme', profile.includes("bg-[#08182b]") && profile.includes('border-white/10')],
  ['profile remains floating and non-layout consuming', profile.includes('fixed right-4 top-4')],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) process.exit(1)
console.log('PASS shared DataNexus theme contract')
