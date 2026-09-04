import fs from 'node:fs'

const read=(path)=>fs.readFileSync(path,'utf8')
const page=read('app/lineage/page.tsx')
const explorer=read('app/lineage/lineage-explorer.tsx')

const requiredPageContracts=[
  "from('lineage_column_mappings')",
  "from('profile_columns')",
  "from('profile_findings')",
  "from('profile_metrics')",
  "from('data_quality_scores')",
  "from('glossary_mappings')",
  "from('glossary_terms')",
  "from('stewardship_assignments')",
  "from('dataset_classifications')",
  "from('certification_requests')",
  "from('data_contracts')",
  "from('issues')",
  "from('observability_alerts')",
  'Governance Intelligence Lineage Explorer',
  'fieldKey(',
  'dqMethod',
  'for(const column of profileColumns)',
  'syntheticAssetId=`profile:${datasetId}`',
  'buildField(syntheticAssetId,columnName,datasetId',
]

const requiredExplorerContracts=[
  "'dq'",
  "'terms'",
  "'stakeholders'",
  "'classification'",
  "'certification'",
  "'contracts'",
  "'issues'",
  "'observability'",
  "'profiling'",
  "'transformation'",
  'Governance overlays',
  'Field lineage explorer',
  'Field governance context',
  'DQ &lt; 80',
  'Governed fields only',
  'visibleFields',
  'Profiled lineage fields',
  'Field-to-field arrows are shown only when an explicit persisted column mapping exists.',
  'not inferring transformations from matching column names',
]

for(const contract of requiredPageContracts){
  if(!page.includes(contract))throw new Error(`Missing lineage explorer projection contract: ${contract}`)
}
for(const contract of requiredExplorerContracts){
  if(!explorer.includes(contract))throw new Error(`Missing lineage explorer UI contract: ${contract}`)
}

if(page.includes('production_mutation_performed: true')||explorer.includes('production_mutation_performed: true')){
  throw new Error('Lineage explorer must remain a read-only governance visualization surface.')
}

console.log('Lineage explorer overlay contracts verified.')
