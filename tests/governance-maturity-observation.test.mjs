import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const service = fs.readFileSync('lib/governance/maturity-observation-service.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/maturity/observe/route.ts', 'utf8')

test('automated maturity observation is organization-admin controlled', () => {
  assert.match(service, /authorizeOrganizationAdmin/)
  assert.match(route, /requireApiUser/)
})

test('automated observations cover catalog metadata, data quality, lineage, and stewardship', () => {
  for (const key of [
    'DATANEXUS_CATALOG_METADATA_COVERAGE',
    'DATANEXUS_DQ_RULE_COVERAGE',
    'DATANEXUS_LINEAGE_DATASET_COVERAGE',
    'DATANEXUS_STEWARDSHIP_DATASET_COVERAGE',
  ]) assert.match(service, new RegExp(key))
})

test('machine observation does not overwrite declared maturity', () => {
  assert.match(service, /coverage_only_does_not_overwrite_declared_maturity/)
  assert.match(service, /maturity_assessment_observations/)
  assert.doesNotMatch(service, /maturity_assessment_responses'\)\.update/)
})

test('empty connected estate is not misrepresented as zero maturity', () => {
  assert.match(service, /NO_PROJECTS/)
  assert.match(service, /NO_DATASETS/)
})
