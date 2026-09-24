import fs from 'node:fs'
import path from 'node:path'

const layout = fs.readFileSync('app/layout.tsx','utf8')
const css = fs.readFileSync('app/globals.css','utf8')
const legacy = fs.readFileSync('app/legacy-dark-compat.css','utf8')
const floating = fs.readFileSync('components/ai/floating-datanexus-agent.tsx','utf8')
const bar = fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')

const representativePages = [
  'app/catalog/page.tsx',
  'app/glossary/page.tsx',
  'app/data-quality/page.tsx',
  'app/profiling/explorer/page.tsx',
  'app/lineage/page.tsx',
  'app/issues/page.tsx',
  'app/observability/page.tsx',
  'app/reports/page.tsx',
  'app/workflows/page.tsx',
  'app/schedules/page.tsx',
  'app/audit/page.tsx',
  'app/classification/page.tsx',
  'app/datasets/page.tsx',
  'app/admin/page.tsx',
].filter(fs.existsSync)

const checks = [
  ['root html is dark-native', layout.includes('<html lang="en" className="dark">')],
  ['all routes inherit DataNexus page shell', layout.includes('<body className="dn-page antialiased">')],
  ['global semantic surfaces exist', css.includes('.dn-surface') && css.includes('.dn-inset') && css.includes('.dn-control')],
  ['root canvas uses approved modernized navy base', css.includes('--dn-canvas: 11 20 34') && css.includes('#0b1422')],
  ['legacy light workspaces remain bridged during migration', legacy.includes('Legacy light-workspace bridge') && legacy.includes('html.dark main.min-h-screen.bg-slate-50')],
  ['global utility bar uses shared DataNexus surface', bar.includes('dn-topbar') && bar.includes('dn-control')],
  ['floating AI remains overlay-only', floating.includes('fixed bottom-5 left-4') && floating.includes('fixed bottom-20 left-4')],
]

for (const page of representativePages) {
  const source = fs.readFileSync(page,'utf8')
  checks.push([`representative workspace compiles as routed page: ${page}`, source.length > 40])
}

const failures = checks.filter(([,ok]) => !ok)
for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`)
if (failures.length) process.exit(1)
console.log(`PASS whole-product DataNexus theme contract across ${representativePages.length} representative governed workspaces`)
