import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'app/api/ux/events/route.ts',
  'components/app-shell/journey-telemetry.tsx',
  'app/journeys/page.tsx',
  'docs/ux-product-telemetry.md',
  'supabase/migrations/20260904151010_analytics_event_fallback_store.sql',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS UX telemetry artifact ${path}`)
}

const route = await readFile('app/api/ux/events/route.ts', 'utf8')
for (const [pattern, label] of [
  [/UX_JOURNEY_VIEWED/, 'journey-view event allow-list'],
  [/UX_JOURNEY_NEXT_ACTION_SELECTED/, 'next-action event allow-list'],
  [/CONNECT.*DISCOVER.*PROFILE.*REMEDIATE.*VERIFY.*COMPLETE/s, 'bounded journey-stage vocabulary'],
  [/authorizeProject\(user\.id, projectId, 'catalog\.read'\)/, 'project authorization before persistence'],
  [/schema\('orchestration'\)\.from\('analytics_events'\)/, 'service-only analytics fallback store'],
  [/aggregate_type:\s*'ux_governance_journey'/, 'bounded UX aggregate type'],
  [/payload:\s*{\s*stage,\s*completedStages,\s*totalStages:\s*5,?\s*}/s, 'allow-listed telemetry payload'],
  [/Unable to record UX telemetry event\./, 'generic client failure response'],
]) {
  if (!pattern.test(route)) throw new Error(`UX telemetry route missing ${label}`)
  console.log(`PASS ${label}`)
}

if (/payload:\s*body/.test(route) || /payload:\s*{\s*\.\.\.body/s.test(route)) {
  throw new Error('UX telemetry must not persist arbitrary request payloads.')
}
console.log('PASS arbitrary request payloads are not persisted')

const client = await readFile('components/app-shell/journey-telemetry.tsx', 'utf8')
for (const [pattern, label] of [
  [/fetch\('\/api\/ux\/events'/, 'same-origin telemetry endpoint'],
  [/keepalive:\s*true/, 'navigation-safe best-effort delivery'],
  [/sessionStorage\.getItem/, 'best-effort journey-view de-duplication'],
  [/catch\s*{[\s\S]*must never block the governed user journey/, 'non-blocking telemetry failure behavior'],
]) {
  if (!pattern.test(client)) throw new Error(`UX telemetry client missing ${label}`)
  console.log(`PASS ${label}`)
}

const journey = await readFile('app/journeys/page.tsx', 'utf8')
if (!/JourneyViewTelemetry/.test(journey) || !/TrackedJourneyLink/.test(journey)) {
  throw new Error('Guided journey must emit view telemetry and track the primary next action.')
}
console.log('PASS guided journey is instrumented')

const migration = await readFile('supabase/migrations/20260904151010_analytics_event_fallback_store.sql', 'utf8')
for (const [pattern, label] of [
  [/alter table orchestration\.analytics_events enable row level security/i, 'analytics RLS'],
  [/revoke all on table orchestration\.analytics_events from anon, authenticated/i, 'non-service analytics access revoked'],
  [/grant all on table orchestration\.analytics_events to service_role/i, 'service-only analytics persistence'],
]) {
  if (!pattern.test(migration)) throw new Error(`Analytics fallback store missing ${label}`)
  console.log(`PASS ${label}`)
}

console.log('DataNexus UX product telemetry verification completed.')
