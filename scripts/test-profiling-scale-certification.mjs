import assert from 'node:assert/strict'
const { evaluateProfilingScaleEvidence } = await import('../lib/profiling/scale-certification.ts')

const now=Date.parse('2026-09-12T12:00:00Z')
assert.deepEqual(evaluateProfilingScaleEvidence([],now), { state: 'NOT_MEASURED', blockers: ['NO_RUNTIME_EVIDENCE'] })

const shapes=['WIDE_TABLE','HIGH_CARDINALITY','NULL_HEAVY','UNICODE','LARGE_STRINGS','SCHEMA_DRIFT','MALFORMED_RECORDS']
const base={columnCount:40,peakMemoryBytes:256000000,errorRate:0,profileRunId:'run-1',datasetVersionId:'version-1',observedAt:'2026-09-12T11:00:00Z',productionRepresentative:true,shapes}
const pass=[
  {...base,tierId:'ROWS_10K',rowCount:10000,durationSeconds:10},
  {...base,tierId:'ROWS_100K',rowCount:100000,durationSeconds:100},
  {...base,tierId:'ROWS_1M',rowCount:1000000,durationSeconds:1000},
]
assert.equal(evaluateProfilingScaleEvidence(pass,now).state,'PASS')

const previewOnly=pass.map((x)=>({...x,productionRepresentative:false}))
assert.equal(evaluateProfilingScaleEvidence(previewOnly,now).state,'FAIL')
assert(evaluateProfilingScaleEvidence(previewOnly,now).blockers.includes('ROWS_1M_NOT_MEASURED'))
assert(evaluateProfilingScaleEvidence(previewOnly,now).blockers.includes('SHAPE_MALFORMED_RECORDS_NOT_MEASURED'))

const tooSlow=pass.map((x)=>x.tierId==='ROWS_100K'?{...x,durationSeconds:301}:x)
assert(evaluateProfilingScaleEvidence(tooSlow,now).blockers.includes('ROWS_100K_P95_EXCEEDED'))

const tooManyErrors=pass.map((x)=>x.tierId==='ROWS_1M'?{...x,errorRate:0.02}:x)
assert(evaluateProfilingScaleEvidence(tooManyErrors,now).blockers.includes('ROWS_1M_ERROR_RATE_EXCEEDED'))

const incompleteShapes=pass.map((x)=>({...x,shapes:['WIDE_TABLE']}))
assert(evaluateProfilingScaleEvidence(incompleteShapes,now).blockers.includes('SHAPE_MALFORMED_RECORDS_NOT_MEASURED'))

const underTier=pass.map((x)=>x.tierId==='ROWS_1M'?{...x,rowCount:999999}:x)
assert(evaluateProfilingScaleEvidence(underTier,now).blockers.includes('ROWS_1M_ROW_COUNT_BELOW_TIER'))

const stale=pass.map((x)=>({...x,observedAt:'2026-09-10T00:00:00Z'}))
assert(evaluateProfilingScaleEvidence(stale,now).blockers.includes('ROWS_1M_EVIDENCE_STALE'))

const future=pass.map((x)=>({...x,observedAt:'2026-09-12T12:10:01Z'}))
assert(evaluateProfilingScaleEvidence(future,now).blockers.includes('ROWS_1M_TIMESTAMP_FUTURE'))

const invalidNumeric=pass.map((x)=>x.tierId==='ROWS_100K'?{...x,durationSeconds:-1,peakMemoryBytes:-1,columnCount:0,errorRate:-0.1}:x)
const invalidResult=evaluateProfilingScaleEvidence(invalidNumeric,now)
assert(invalidResult.blockers.includes('ROWS_100K_DURATION_INVALID'))
assert(invalidResult.blockers.includes('ROWS_100K_MEMORY_INVALID'))
assert(invalidResult.blockers.includes('ROWS_100K_COLUMN_COUNT_INVALID'))
assert(invalidResult.blockers.includes('ROWS_100K_ERROR_RATE_INVALID'))

const missingIdentity=pass.map((x)=>x.tierId==='ROWS_10K'?{...x,profileRunId:'',datasetVersionId:''}:x)
assert(evaluateProfilingScaleEvidence(missingIdentity,now).blockers.includes('ROWS_10K_IDENTITY_EVIDENCE_MISSING'))

console.log('Profiling scale certification negative/failure tests passed.')
