import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createXlsxWorkbook } from '../lib/export/xlsx.ts'

test('lineage XLSX writer emits a valid ZIP workbook envelope', () => {
  const bytes = createXlsxWorkbook([
    { name: 'Summary', rows: [['Key','Value'],['Mappings',2]] },
    { name: 'Source to Target Mapping', rows: [['Source','Target'],['a','b']] },
  ])
  assert.ok(bytes instanceof Uint8Array)
  assert.ok(bytes.length > 500)
  assert.equal(bytes[0], 0x50)
  assert.equal(bytes[1], 0x4b)
  assert.equal(bytes[2], 0x03)
  assert.equal(bytes[3], 0x04)
  const text = new TextDecoder().decode(bytes)
  assert.match(text, /xl\/workbook\.xml/)
  assert.match(text, /Source to Target Mapping/)
  assert.match(text, /Mappings/)
})

test('lineage export route is governed and exports persisted mappings only', () => {
  const route = fs.readFileSync('app/api/lineage/export/route.ts','utf8')
  assert.match(route, /await requireApiUser\(\)/)
  assert.match(route, /lineage_column_mappings/)
  assert.match(route, /lineage_transformations/)
  assert.match(route, /lineage_assets/)
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/)
  assert.doesNotMatch(route, /infer.*matching|matching.*column.*infer/i)
})

test('lineage page exposes the Excel export action', () => {
  const page = fs.readFileSync('app/lineage/page.tsx','utf8')
  assert.match(page, /href="\/api\/lineage\/export"/)
  assert.match(page, /Export lineage to Excel/)
})


test('lineage export includes steward validation columns for source-to-target review', () => {
  const route = fs.readFileSync('app/api/lineage/export/route.ts','utf8')
  for (const heading of ['Source Data Type','Target Data Type','Confidence','Evidence Source','Code Reference','First Seen','Last Seen','Version','Notes']) {
    assert.ok(route.includes(heading), 'Missing lineage validation column: ' + heading)
  }
  assert.match(route, /mappingMetadata/)
  assert.match(route, /transformationMetadata/)
})
