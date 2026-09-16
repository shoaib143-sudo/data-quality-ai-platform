import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCsvHeaders, parseCsv } from '../lib/profiling/csv-source.ts'

test('duplicate headers are preserved with deterministic suffixes', () => {
  const parsed=parseCsv('id,name,name\n001,Alice,Alias\n',10)
  assert.deepEqual(parsed.rows,[{id:'001',name:'Alice',name__2:'Alias'}])
})

test('three repeated headers remain lossless', () => {
  assert.deepEqual(normalizeCsvHeaders(['value','value','value']),['value','value__2','value__3'])
  const parsed=parseCsv('value,value,value\n1,2,3\n',10)
  assert.deepEqual(parsed.rows,[{value:1,value__2:2,value__3:3}])
})

test('generated duplicate suffixes never collide with literal headers', () => {
  assert.deepEqual(normalizeCsvHeaders(['value','value__2','value']),['value','value__2','value__3'])
  const parsed=parseCsv('value,value__2,value\n1,2,3\n',10)
  assert.deepEqual(parsed.rows,[{value:1,value__2:2,value__3:3}])
})

test('blank generated headers never collide with literal column names', () => {
  assert.deepEqual(normalizeCsvHeaders(['','column_1','']),['column_1','column_1__2','column_3'])
})

test('blank and BOM-prefixed headers are normalized deterministically', () => {
  assert.deepEqual(normalizeCsvHeaders(['\uFEFFid','','']),['id','column_2','column_3'])
  const parsed=parseCsv('\uFEFFid,,\n007,left,right\n',10)
  assert.deepEqual(parsed.rows,[{id:'007',column_2:'left',column_3:'right'}])
})

test('quoted commas and escaped quotes are parsed without column drift', () => {
  const parsed=parseCsv('id,description\n1,"hello, ""world"""\n',10)
  assert.deepEqual(parsed.rows,[{id:'1',description:'hello, "world"'}])
})

test('unterminated quoted fields fail closed', () => {
  assert.throws(()=>parseCsv('id,description\n1,"broken\n',10),/Invalid CSV source: unterminated quoted field/)
})

test('missing trailing fields remain null while blank fields remain blank', () => {
  const parsed=parseCsv('name,optional,missing\nAlice,,\nBob,provided\n',10)
  assert.deepEqual(parsed.rows,[
    {name:'Alice',optional:'',missing:''},
    {name:'Bob',optional:'provided',missing:null},
  ])
})

test('type drift is preserved per value without lossy coercion', () => {
  const parsed=parseCsv('metric\n42\ntext\ntrue\n0042\n',10)
  assert.deepEqual(parsed.rows,[
    {metric:42},
    {metric:'text'},
    {metric:true},
    {metric:'0042'},
  ])
})

test('identifier-like fields remain text and row truncation reports full count', () => {
  const parsed=parseCsv('customer_id,phone,score\n0001,012345,1\n0002,067890,2\n',1)
  assert.deepEqual(parsed.rows,[{customer_id:'0001',phone:'012345',score:1}])
  assert.equal(parsed.rowCount,2)
  assert.equal(parsed.warnings.length,1)
})


test('generated duplicate suffixes never collide with source headers', () => {
  assert.deepEqual(normalizeCsvHeaders(['name','name','name__2']),['name','name__2','name__2__2'])
  const parsed=parseCsv('name,name,name__2\nfirst,second,explicit\n',10)
  assert.deepEqual(parsed.rows,[{name:'first',name__2:'second',name__2__2:'explicit'}])
})

test('blank generated headers never overwrite explicit column names', () => {
  assert.deepEqual(normalizeCsvHeaders(['','column_1']),['column_1','column_1__2'])
})
