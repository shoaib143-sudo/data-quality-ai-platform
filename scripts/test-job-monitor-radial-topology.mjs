import assert from 'node:assert/strict'
import fs from 'node:fs'

const layout = fs.readFileSync('app/monitoring/layout.tsx', 'utf8')
const css = fs.readFileSync('app/monitoring/job-monitor-final-topology.css', 'utf8')

assert.match(layout, /import '\.\/job-monitor-radial-topology\.css'/, 'Monitoring layout must retain the radial topology correction CSS.')
assert.match(layout, /import '\.\/job-monitor-final-topology\.css'/, 'Monitoring layout must load the final high-specificity topology guard after the legacy correction.')
assert.match(css, /\.monitoringStage\.monitoringStage article:has/, 'Final topology guard must outrank older organic-cell selectors regardless of CSS chunk order.')
assert.match(css, /div\[aria-label\*="execution components inside"\] \{[\s\S]*left: 50% !important;[\s\S]*top: 52% !important;/, 'Feature nodes must share one centered coordinate frame.')
assert.match(css, /> button\[aria-label\$="Data Domain summary"\] \{[\s\S]*left: 50% !important;[\s\S]*top: 52% !important;/, 'Supervisor must share the exact feature-frame center.')
assert.match(css, /> svg \{[\s\S]*display: none !important;/, 'Legacy mismatched SVG links must remain disabled.')
assert.match(css, /repeating-conic-gradient\([\s\S]*45deg/, 'Radial topology must render eight evenly spaced nerve spokes.')

const expected = [
  ['1', '50%', '10%'],
  ['2', '78%', '22%'],
  ['3', '90%', '50%'],
  ['4', '78%', '78%'],
  ['5', '50%', '90%'],
  ['6', '22%', '78%'],
  ['7', '10%', '50%'],
  ['8', '22%', '22%'],
]

for (const [index, left, top] of expected) {
  const re = new RegExp(`nth-child\\(${index}\\) \\{ left: ${left} !important; top: ${top} !important; \\}`)
  assert.match(css, re, `Feature ${index} must stay on its deterministic compass position.`)
}

assert.match(css, /> div:nth-of-type\(5\) \{[\s\S]*bottom: 4\.5% !important;/, 'Domain progress must remain a bottom rail rather than displacing the neural topology.')
assert.match(css, /width: 4\.8rem !important;[\s\S]*height: 4\.8rem !important;/, 'Desktop feature cells must stay compact enough to avoid overlap at all eight compass points.')
assert.doesNotMatch(css, /right: 5% !important;[\s\S]{0,120}top: 35% !important;/, 'The old right-side progress rail must not be reintroduced.')

console.log('Job Monitor radial topology contract passed: high-specificity shared center, eight deterministic feature nodes, connected spokes, compact endpoints, no overlap rail.')
