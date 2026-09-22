import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveDirectPostgresViewLineage } from '../supabase/functions/_shared/postgres-view-column-lineage.ts'

test('derives authoritative direct projections from a single PostgreSQL source relation', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: `
      SELECT id,
             project_id,
             term,
             definition
      FROM governance.glossary_terms t
      WHERE status = 'REFERENCE';
    `,
    targetSchema: 'governance',
    targetView: 'glossary_reference_concepts',
    targetColumns: ['id', 'project_id', 'term', 'definition'],
  })

  assert.ok(result)
  assert.equal(result.sourceAsset, 'governance.glossary_terms')
  assert.equal(result.targetAsset, 'governance.glossary_reference_concepts')
  assert.equal(result.columnMappings.length, 4)
  assert.deepEqual(result.columnMappings.map(mapping => [mapping.sourceColumn, mapping.targetColumn]), [
    ['id', 'id'],
    ['project_id', 'project_id'],
    ['term', 'term'],
    ['definition', 'definition'],
  ])
  assert.equal(result.skippedProjectionCount, 0)
  assert.ok(result.columnMappings.every(mapping => mapping.metadata.authoritative_source === 'pg_views.definition'))
})

test('keeps proven direct projections and skips computed expressions', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: `
      SELECT s.id,
             s.name AS source_name,
             upper(s.status) AS status_upper
      FROM catalog.data_sources AS s
      WHERE s.status = 'ACTIVE';
    `,
    targetSchema: 'catalog',
    targetView: 'active_source_summary',
    targetColumns: ['id', 'source_name', 'status_upper'],
  })

  assert.ok(result)
  assert.deepEqual(result.columnMappings.map(mapping => [mapping.sourceColumn, mapping.targetColumn]), [
    ['id', 'id'],
    ['name', 'source_name'],
  ])
  assert.equal(result.skippedProjectionCount, 1)
})

test('rejects joins because a column qualifier can no longer prove one source relation', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: 'SELECT d.id, c.label FROM catalog.datasets d JOIN governance.classifications c ON c.dataset_id = d.id',
    targetSchema: 'governance',
    targetView: 'dataset_labels',
    targetColumns: ['id', 'label'],
  })
  assert.equal(result, null)
})

test('rejects subquery-backed views rather than guessing field authority', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: 'SELECT x.id FROM (SELECT id FROM catalog.datasets) x',
    targetSchema: 'catalog',
    targetView: 'dataset_ids',
    targetColumns: ['id'],
  })
  assert.equal(result, null)
})

test('supports quoted identifiers and canonicalizes target column casing', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: 'SELECT "s"."SourceId" AS "SourceID" FROM "catalog"."SourceTable" "s"',
    targetSchema: 'catalog',
    targetView: 'SourceView',
    targetColumns: ['SourceID'],
  })
  assert.ok(result)
  assert.equal(result.sourceAsset, 'catalog.SourceTable')
  assert.equal(result.columnMappings[0].sourceColumn, 'SourceId')
  assert.equal(result.columnMappings[0].targetColumn, 'SourceID')
})

test('does not invent mappings for DISTINCT ON view projections', () => {
  const result = deriveDirectPostgresViewLineage({
    logic: 'SELECT DISTINCT ON (project_id) project_id, id FROM governance.events ORDER BY project_id, created_at DESC',
    targetSchema: 'governance',
    targetView: 'latest_event',
    targetColumns: ['project_id', 'id'],
  })
  assert.equal(result, null)
})
