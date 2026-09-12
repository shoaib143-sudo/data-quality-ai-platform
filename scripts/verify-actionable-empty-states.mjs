import fs from 'node:fs'

const component = fs.readFileSync('components/app-shell/workspace-empty.tsx', 'utf8')
const journeys = fs.readFileSync('app/journeys/page.tsx', 'utf8')
const experience = fs.readFileSync('app/reports/experience/page.tsx', 'utf8')

for (const [text, marker, label] of [
  [component, 'aria-live="polite"', 'polite assistive announcement'],
  [component, 'aria-atomic="true"', 'atomic assistive announcement'],
  [component, 'focus-visible:ring-2', 'visible keyboard focus'],
  [component, "headingLevel?: 'h1' | 'h2'", 'governed heading level'],
  [component, 'actionHref?: string', 'optional primary recovery action'],
  [component, 'secondaryHref?: string', 'optional secondary recovery action'],
  [journeys, 'WorkspaceEmptyState', 'guided journey shared empty state'],
  [journeys, 'Open governed discovery', 'guided journey recovery action'],
  [experience, 'WorkspaceEmptyState', 'experience report shared empty state'],
  [experience, 'headingLevel="h1"', 'experience page-level heading'],
  [experience, 'Open guided journeys', 'experience report recovery action'],
  [experience, 'No telemetry outside that scope is queried.', 'access-scope truth boundary'],
  [experience, 'evidenceComplete && firstInteraction && firstCompleteTelemetry', 'governed evidence timing guard preserved'],
]) {
  if (!text.includes(marker)) throw new Error(`Actionable empty-state contract missing: ${label}`)
}

if (/certified|certification complete|governance complete/i.test(component)) {
  throw new Error('Shared empty-state component must not manufacture governance completion semantics')
}

console.log('Actionable empty workspace states verified: accessible, heading-safe, scope-safe, and recovery-oriented.')
