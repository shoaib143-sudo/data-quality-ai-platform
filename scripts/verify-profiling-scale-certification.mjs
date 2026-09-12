import fs from 'node:fs'

const contract=JSON.parse(fs.readFileSync('infra/profiling/scale-certification-contract.json','utf8'))
const evaluator=fs.readFileSync('lib/profiling/scale-certification.ts','utf8')
const migration=fs.readFileSync('supabase/migrations/20260912065000_profile_replay_fk_indexes.sql','utf8')

if(contract.schemaVersion!==2) throw new Error('Profiling scale contract must remain versioned')
if(contract.claimAuthority!=='MEASURED_RUNTIME_EVIDENCE_ONLY') throw new Error('Profiling scale PASS must remain runtime-evidence-only')
if(contract.syntheticEvidenceMaySatisfyProductionClaim!==false) throw new Error('Synthetic evidence must not satisfy production scale claims')
if(contract.maxEvidenceAgeHours!==24) throw new Error('Production scale evidence must remain freshness-bound to 24 hours')
if(contract.shapeEvidenceAuthority!=='PRODUCTION_REPRESENTATIVE_ONLY') throw new Error('Adverse-shape evidence must come from production-representative measurements')
for(const id of ['ROWS_10K','ROWS_100K','ROWS_1M']) if(!contract.requiredTiers.some((x)=>x.id===id)) throw new Error(`Missing scale tier ${id}`)
for(const shape of ['WIDE_TABLE','HIGH_CARDINALITY','NULL_HEAVY','UNICODE','LARGE_STRINGS','SCHEMA_DRIFT','MALFORMED_RECORDS']) if(!contract.requiredShapes.includes(shape)) throw new Error(`Missing required shape ${shape}`)
for(const marker of ['NO_RUNTIME_EVIDENCE','_NOT_MEASURED','_P95_EXCEEDED','_ERROR_RATE_EXCEEDED','_ROW_COUNT_BELOW_TIER','_EVIDENCE_STALE','_TIMESTAMP_FUTURE','_DURATION_INVALID','_MEMORY_INVALID','_COLUMN_COUNT_INVALID','productionRepresentative','PROFILING_SCALE_MAX_EVIDENCE_AGE_MS']) if(!evaluator.includes(marker)) throw new Error(`Scale evaluator missing fail-closed marker ${marker}`)
for(const index of ['profile_dataset_replays_dataset_version_fk_idx','profile_investigation_replays_dataset_version_fk_idx','profile_metric_execution_replays_dataset_version_fk_idx']) if(!migration.includes(index)) throw new Error(`Missing replay FK index ${index}`)
if(/drop\s+index/i.test(migration)) throw new Error('Scale hardening must not drop indexes without measured workload evidence')
console.log('Profiling scale certification contract verified: fresh measured evidence only, numeric validity, production-representative shapes, three scale tiers, additive FK indexes.')
