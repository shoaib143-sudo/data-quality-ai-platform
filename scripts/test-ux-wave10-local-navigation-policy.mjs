import assert from 'node:assert/strict'
import fs from 'node:fs'

const autonomous=fs.readFileSync('app/data-quality/autonomous/page.tsx','utf8')
const privacy=fs.readFileSync('app/classification-privacy/page.tsx','utf8')
const ingest=fs.readFileSync('app/lineage/ingest/page.tsx','utf8')
const domain=fs.readFileSync('app/monitoring/domain/[projectId]/page.tsx','utf8')
const incidents=fs.readFileSync('app/observability/incidents/page.tsx','utf8')

assert.ok(autonomous.includes("canAccessWorkspace(landingAccess.persona, 'issues'"), 'Autonomous DQ issues CTA must derive from workspace policy')
assert.ok(autonomous.includes("canAccessWorkspace(landingAccess.persona, 'agents'"), 'Autonomous DQ run evidence must derive from workspace policy')
assert.ok(autonomous.includes('canIssues ? <Link href="/issues"'), 'Autonomous DQ must hide issues when inaccessible')
assert.ok(autonomous.includes('canAgents ? <Link href={`/agents/runs/'), 'Autonomous DQ must hide run evidence when Agents is inaccessible')

assert.ok(privacy.includes("canAccessWorkspace(landing.persona, 'catalog'"), 'Classification Privacy Catalog CTA must derive from workspace policy')
assert.ok(privacy.includes('canCatalog ? <Link href="/catalog"'), 'Classification Privacy must hide Catalog when inaccessible')

assert.ok(ingest.includes("canAccessWorkspace(landing.persona, 'discovery'"), 'Lineage Ingestion Discovery CTA must derive from workspace policy')
assert.ok(ingest.includes('canDiscovery ? <Link href="/catalog/discovery"'), 'Lineage Ingestion must hide Discovery when inaccessible')

assert.ok(domain.includes("canAccessWorkspace(landing.persona, 'agents'"), 'Domain Monitoring Agent CTAs must derive from workspace policy')
assert.ok(domain.includes('canAgents ? <Link href="/agents"'), 'Domain Monitoring must hide run-feature CTA when Agents is inaccessible')
assert.ok(domain.includes('canAgents && latestRun ? <Link href={`/agents/runs/'), 'Domain Monitoring latest output must be access gated')

assert.ok(incidents.includes("canAccessWorkspace(landing.persona,'lineage'"), 'Observability Incidents Impact CTA must derive from workspace policy')
assert.ok(incidents.includes("canAccessWorkspace(landing.persona,'workflows'"), 'Observability Incidents workflow CTA must derive from workspace policy')
assert.ok(incidents.includes('canLineage?<Link href="/lineage/impact"'), 'Observability Incidents must hide Impact when inaccessible')
assert.ok(incidents.includes('canWorkflows?<Link href="/workflows"'), 'Observability Incidents must hide approval/workflow links when inaccessible')

console.log('Wave 10 local-navigation policy contract passed.')
