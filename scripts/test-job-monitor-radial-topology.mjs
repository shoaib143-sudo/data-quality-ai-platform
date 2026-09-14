import assert from 'node:assert/strict'
import fs from 'node:fs'

const layout = fs.readFileSync('app/monitoring/layout.tsx', 'utf8')
const css = fs.readFileSync('app/monitoring/job-monitor-final-topology.css', 'utf8')
const connectors = fs.readFileSync('app/monitoring/job-monitor-explicit-connectors.css', 'utf8')

assert.match(layout, /import '\.\/job-monitor-radial-topology\.css'/, 'Monitoring layout must retain the radial topology correction CSS.')
assert.match(layout, /import '\.\/job-monitor-final-topology\.css'/, 'Monitoring layout must load the final high-specificity topology guard after the legacy correction.')
assert.match(layout, /import '\.\/job-monitor-explicit-connectors\.css'/, 'Monitoring layout must load the explicit feature connector layer last.')
assert.match(css, /\.monitoringStage\.monitoringStage article:has/, 'Final topology guard must outrank older organic-cell selectors regardless of CSS chunk order.')
assert.match(css, /div\[aria-label\*="execution components inside"\] \{[\s\S]*left: 50% !important;[\s\S]*top: 52% !important;/, 'Feature nodes must share one centered coordinate frame.')
assert.match(css, /> button\[aria-label\$="Data Domain summary"\] \{[\s\S]*left: 50% !important;[\s\S]*top: 52% !important;/, 'Supervisor must share the exact feature-frame center.')
assert.match(css, /> svg \{[\s\S]*display: none !important;/, 'Legacy mismatched SVG links must remain disabled.')

const expected = [
  ['1', '50%', '10%', '90deg'],
  ['2', '78%', '22%', '135deg'],
  ['3', '90%', '50%', '180deg'],
  ['4', '78%', '78%', '225deg'],
  ['5', '50%', '90%', '270deg'],
  ['6', '22%', '78%', '315deg'],
  ['7', '10%', '50%', '0deg'],
  ['8', '22%', '22%', '45deg'],
]

for (const [index, left, top, rotation] of expected) {
  const positionRe = new RegExp(`nth-child\\(${index}\\) \\{ left: ${left} !important; top: ${top} !important; \\}`)
  assert.match(css, positionRe, `Feature ${index} must stay on its deterministic compass position.`)
  const connectorRe = new RegExp(`nth-child\\(${index}\\)::before \\{ transform: rotate\\(${rotation}\\) !important; \\}`)
  assert.match(connectors, connectorRe, `Feature ${index} must have a physical connector aimed at the Supervisor.`)
}

assert.match(connectors, /> div::before \{[\s\S]*width: 9\.25rem !important;[\s\S]*height: 2px !important;/, 'Each feature wrapper must render a real nerve long enough to reach the Supervisor.')
assert.match(connectors, /background: none !important;[\s\S]*opacity: 0 !important;/, 'Decorative conic spoke field must be disabled once explicit connectors are active.')
assert.match(connectors, /> div > button \{[\s\S]*z-index: 2 !important;/, 'Feature cells must sit above their connector so the nerve appears attached at the rim.')
assert.match(connectors, /:has\(button\[class\*="border-slate"\]\)::before/, 'Never-executed feature connectors must remain visually subdued.')
assert.match(css, /> div:nth-of-type\(5\) \{[\s\S]*bottom: 4\.5% !important;/, 'Domain progress must remain a bottom rail rather than displacing the neural topology.')
assert.match(css, /width: 4\.8rem !important;[\s\S]*height: 4\.8rem !important;/, 'Desktop feature cells must stay compact enough to avoid overlap at all eight compass points.')
assert.doesNotMatch(css, /right: 5% !important;[\s\S]{0,120}top: 35% !important;/, 'The old right-side progress rail must not be reintroduced.')

console.log('Job Monitor radial topology contract passed: one shared center, eight deterministic nodes, eight physical connectors, compact endpoints, no detached cells.')
