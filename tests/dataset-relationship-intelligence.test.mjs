import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const { buildDatasetRelationshipIntelligence } = await import('../lib/governance/dataset-relationship-contract.ts')

const datasets = [
  { id: 'source', name: 'Customer Master', businessDomain: 'Customer' },
  { id: 'lineage', name: 'Customer Analytics', businessDomain: 'Analytics' },
  { id: 'cde', name: 'Customer Contact', businessDomain: 'Customer' },
  { id: 'incident', name: 'Customer Serving', businessDomain: 'Operations' },
  { id: 'domain', name: 'Customer Reference', businessDomain: 'Customer' },
  { id: 'suggested', name: 'Suggested Only', businessDomain: 'Other' },
]

test('authoritative lineage is the only signal that produces source-authoritative relationship class', () => {
  const result = buildDatasetRelationshipIntelligence({
    sourceDataset: datasets[0],
    datasets,
    lineageSignals: [
      {
        targetDatasetId: 'lineage',
        edgeId: 'edge-1',
        relationship: 'FEEDS',
        authorityState: 'SOURCE_OBSERVED',
        origin: 'SYSTEM_DISCOVERY',
        direction: 'DOWNSTREAM',
      },
      {
        targetDatasetId: 'suggested',
        edgeId: 'edge-legacy',
        relationship: 'MAY_FEED',
        authorityState: 'LEGACY_UNCLASSIFIED',
        origin: 'LEGACY',
        direction: 'DOWNSTREAM',
      },
    ],
  })

  const lineage = result.relationships.find((item) => item.datasetId === 'lineage')
  assert.equal(lineage?.relationshipClass, 'SOURCE_AUTHORITATIVE_RELATIONSHIP')
  assert.equal(lineage?.signals[0].authority, 'SOURCE_AUTHORITATIVE_LINEAGE')
  assert.equal(result.relationships.some((item) => item.datasetId === 'suggested'), false)
})

test('approved shared CDE and current stewardship are governed relationships, never lineage', () => {
  const result = buildDatasetRelationshipIntelligence({
    sourceDataset: datasets[0],
    datasets,
    cdeSignals: [
      {
        targetDatasetId: 'cde',
        cdeId: 'cde-1',
        cdeKey: 'CUSTOMER_EMAIL',
        cdeName: 'Customer Email',
        criticality: 'CRITICAL',
        sourceMappingStatus: 'APPROVED',
        targetMappingStatus: 'APPROVED',
        sourceConfidence: 0.95,
        targetConfidence: 0.9,
      },
      {
        targetDatasetId: 'suggested',
        cdeId: 'cde-2',
        cdeKey: 'CUSTOMER_ID',
        cdeName: 'Customer ID',
        criticality: 'HIGH',
        sourceMappingStatus: 'APPROVED',
        targetMappingStatus: 'SUGGESTED',
        sourceConfidence: 1,
        targetConfidence: 0.8,
      },
    ],
    stewardshipSignals: [
      {
        targetDatasetId: 'cde',
        assignmentId: 'assignment-1',
        principalUserId: 'user-1',
        role: 'DATA_STEWARD',
        status: 'ACTIVE',
        active: true,
        targetState: 'CURRENT',
        subjectState: 'CURRENT',
      },
      {
        targetDatasetId: 'suggested',
        assignmentId: 'assignment-2',
        principalUserId: 'user-2',
        role: 'BUSINESS_OWNER',
        status: 'REVOKED',
        active: false,
        targetState: 'CURRENT',
        subjectState: 'CURRENT',
      },
    ],
  })

  const related = result.relationships.find((item) => item.datasetId === 'cde')
  assert.equal(related?.relationshipClass, 'GOVERNED_RELATIONSHIP')
  assert.ok(related?.signals.some((signal) => signal.authority === 'APPROVED_CDE_MAPPING'))
  assert.ok(related?.signals.some((signal) => signal.authority === 'GOVERNED_STEWARDSHIP'))
  assert.equal(
    related?.signals.some((signal) => signal.authority === 'SOURCE_AUTHORITATIVE_LINEAGE'),
    false,
  )
  assert.equal(result.relationships.some((item) => item.datasetId === 'suggested'), false)
})

test('incident correlation and shared domain remain explicitly non-dependency evidence', () => {
  const result = buildDatasetRelationshipIntelligence({
    sourceDataset: datasets[0],
    datasets,
    incidentSignals: [{
      targetDatasetId: 'incident',
      correlationId: 'corr-1',
      correlationType: 'SHARED_FAILURE_MODE',
      status: 'ACTIVE',
      score: 0.72,
      confidence: 0.81,
    }],
  })

  const incident = result.relationships.find((item) => item.datasetId === 'incident')
  assert.equal(incident?.relationshipClass, 'OBSERVED_CORRELATION')
  assert.match(String(incident?.signals[0].evidence.semantics), /not a lineage assertion/)

  const domain = result.relationships.find((item) => item.datasetId === 'domain')
  assert.equal(domain?.relationshipClass, 'CONTEXT_ONLY')
  assert.match(String(domain?.signals[0].evidence.semantics), /does not establish dependency/)
})

test('runtime consumes only governed evidence boundaries', () => {
  const runtime = fs.readFileSync('lib/governance/dataset-relationship-intelligence.ts', 'utf8')
  const route = fs.readFileSync('app/api/governance/dataset-relationships/route.ts', 'utf8')

  assert.match(runtime, /from\('authoritative_lineage_edges'\)/)
  assert.doesNotMatch(runtime, /from\('lineage_edges'\)/)
  assert.match(runtime, /\.eq\('status', 'APPROVED'\)/)
  assert.match(runtime, /\.eq\('status', 'ACTIVE'\)/)
  assert.match(runtime, /\.eq\('target_state', 'CURRENT'\)/)
  assert.match(runtime, /\.eq\('subject_state', 'CURRENT'\)/)
  assert.match(route, /authorizeProject\(user\.id, projectId, 'catalog\.read'\)/)
  assert.match(route, /hasProjectCapability\(user\.id, projectId, 'lineage\.read'\)/)
})
