import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const {
  boundCatalogMetadataAssetBatch,
  boundCatalogMetadataCandidateBudget,
  catalogMetadataFields,
  normalizeCatalogMetadataCursor,
  planCatalogMetadataCandidates,
} = await import('../lib/governance/catalog-metadata-semantic-contract.ts')

function asset(overrides = {}) {
  return {
    id: 'asset-1',
    sourceId: 'source-1',
    identityKey: 'native:db:table:1',
    assetKey: 'public.customer',
    assetType: 'TABLE',
    namespace: 'public',
    name: 'customer',
    columns: [
      { name: 'customer_id', data_type: 'uuid', nullable: false },
      { name: 'email', type: 'text', nullable: true, semantic_type: 'EMAIL' },
    ],
    metadata: {},
    ...overrides,
  }
}

test('normalizes provider field shapes without inventing unnamed fields', () => {
  assert.deepEqual(catalogMetadataFields([
    { column_name: 'id', source_type: 'bigint', nullable: false },
    { field_name: 'email', data_type: 'varchar', comment: 'Contact email' },
    { type: 'text' },
  ]), [
    {
      name: 'id',
      dataType: 'bigint',
      nullable: false,
      description: null,
      semanticType: null,
      ordinal: 0,
    },
    {
      name: 'email',
      dataType: 'varchar',
      nullable: null,
      description: 'Contact email',
      semanticType: null,
      ordinal: 1,
    },
  ])
})

test('bounds asset and embedding candidate batches', () => {
  assert.equal(boundCatalogMetadataAssetBatch(undefined), 25)
  assert.equal(boundCatalogMetadataAssetBatch(0), 1)
  assert.equal(boundCatalogMetadataAssetBatch(999), 100)
  assert.equal(boundCatalogMetadataCandidateBudget(undefined), 500)
  assert.equal(boundCatalogMetadataCandidateBudget(1), 25)
  assert.equal(boundCatalogMetadataCandidateBudget(99999), 2000)
})

test('emits stable asset and field candidates with current asset identity', () => {
  const planned = planCatalogMetadataCandidates({
    assets: [asset()],
    candidateBudget: 20,
  })
  assert.equal(planned.candidates.length, 3)
  assert.equal(planned.candidates[0].objectType, 'CATALOG_ASSET')
  assert.equal(planned.candidates[0].objectId, 'asset-1')
  assert.match(planned.candidates[0].objectKey, /source-1:native:db:table:1/)
  assert.equal(planned.candidates[2].objectType, 'CATALOG_FIELD')
  assert.equal(planned.candidates[2].metadata.column_name, 'email')
})

test('continues inside an extremely wide asset without offset-scanning the catalog', () => {
  const wide = asset({
    columns: Array.from({ length: 40 }, (_, index) => ({
      name: `field_${index}`,
      data_type: 'text',
    })),
  })
  const first = planCatalogMetadataCandidates({
    assets: [wide],
    candidateBudget: 25,
  })
  assert.equal(first.partialAsset, true)
  assert.deepEqual(first.nextCursor, {
    sourceId: 'source-1',
    assetKey: 'public.customer',
    fieldOffset: 24,
  })

  const resumed = planCatalogMetadataCandidates({
    assets: [wide],
    cursor: first.nextCursor,
    candidateBudget: 25,
  })
  assert.equal(resumed.candidates[0].objectType, 'CATALOG_FIELD')
  assert.equal(resumed.candidates[0].metadata.column_name, 'field_24')
  assert.equal(resumed.partialAsset, false)
})

test('cursor normalization fails safe to the start of a project scan', () => {
  assert.deepEqual(normalizeCatalogMetadataCursor(null), {
    sourceId: null,
    assetKey: '',
    fieldOffset: 0,
  })
  assert.deepEqual(normalizeCatalogMetadataCursor({
    sourceId: ' source-1 ',
    assetKey: ' Public.Customer ',
    fieldOffset: -4,
  }), {
    sourceId: 'source-1',
    assetKey: 'public.customer',
    fieldOffset: 0,
  })
})

test('runtime uses indexed current-asset keyset scans and the existing semantic durable lane', () => {
  const indexer = fs.readFileSync('lib/governance/catalog-metadata-semantic-indexer.ts', 'utf8')
  const scheduler = fs.readFileSync('lib/governance/semantic-jobs.ts', 'utf8')
  const worker = fs.readFileSync('lib/governance/semantic-job-worker.ts', 'utf8')

  assert.match(indexer, /from\('discovered_assets'\)/)
  assert.match(indexer, /\.eq\('is_current', true\)/)
  assert.match(indexer, /\.order\('asset_key'/)
  assert.match(indexer, /\.gt\('asset_key', input\.afterAssetKey\)/)
  assert.doesNotMatch(indexer, /\.range\(/)
  assert.match(scheduler, /jobType: 'SEMANTIC_INDEX'/)
  assert.match(scheduler, /trigger: 'CATALOG_METADATA_INDEX'/)
  assert.match(worker, /trigger === CATALOG_METADATA_INDEX_TRIGGER/)
  assert.match(worker, /idempotencyKey: `semantic-catalog:/)
})

test('search route validates current project assets before returning semantic metadata matches', () => {
  const route = fs.readFileSync('app/api/catalog/metadata/search/route.ts', 'utf8')
  assert.match(route, /authorizeProject\(user\.id, projectId, 'catalog\.read'\)/)
  assert.match(route, /from\('data_sources'\)/)
  assert.match(route, /\.eq\('project_id', projectId\)/)
  assert.match(route, /from\('discovered_assets'\)/)
  assert.match(route, /\.eq\('is_current', true\)/)
  assert.match(route, /projectSourceIds\.has/)
  assert.match(route, /CATALOG_ASSET/)
  assert.match(route, /CATALOG_FIELD/)
})


test('global search only surfaces current catalog metadata projections', () => {
  const route = fs.readFileSync('app/api/search/route.ts', 'utf8')
  assert.match(route, /'CATALOG_ASSET'/)
  assert.match(route, /'CATALOG_FIELD'/)
  assert.match(route, /currentCatalogIds/)
  assert.match(route, /from\('discovered_assets'\)/)
  assert.match(route, /\.eq\('is_current', true\)/)
  assert.match(route, /\/catalog\/physical-assets/)
})
