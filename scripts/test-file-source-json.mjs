import assert from 'node:assert/strict'
import test from 'node:test'

function normalizeJsonRow(value,index){
  return value&&typeof value==='object'&&!Array.isArray(value)?{record_index:index+1,...value}:{record_index:index+1,value}
}

function parseJson(input,maxRows){
  let value
  try{value=JSON.parse(input)}catch(error){throw new Error(`Invalid JSON source: ${error instanceof Error?error.message:'parse failed'}`)}
  const rawRows=Array.isArray(value)?value:[value]
  const rows=rawRows.map((item,index)=>normalizeJsonRow(item,index))
  const warnings=[]
  if(rows.length>maxRows)warnings.push(`JSON source contains ${rows.length} records; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}

test('nested objects and arrays remain structured values',()=>{
  const parsed=parseJson('[{"id":1,"profile":{"tier":"gold"},"tags":["a","b"]}]',10)
  assert.deepEqual(parsed.rows,[{record_index:1,id:1,profile:{tier:'gold'},tags:['a','b']}])
})

test('top-level primitive JSON is wrapped instead of discarded',()=>{
  assert.deepEqual(parseJson('null',10).rows,[{record_index:1,value:null}])
  assert.deepEqual(parseJson('42',10).rows,[{record_index:1,value:42}])
})

test('empty arrays remain valid zero-row JSON sources',()=>{
  const parsed=parseJson('[]',10)
  assert.equal(parsed.rowCount,0)
  assert.deepEqual(parsed.rows,[])
})

test('malformed JSON fails closed with a source-specific error',()=>{
  assert.throws(()=>parseJson('{"id":1',10),/Invalid JSON source:/)
})

test('row limits preserve total source row count',()=>{
  const parsed=parseJson('[{"id":1},{"id":2},{"id":3}]',2)
  assert.equal(parsed.rowCount,3)
  assert.equal(parsed.rows.length,2)
  assert.equal(parsed.warnings.length,1)
})
