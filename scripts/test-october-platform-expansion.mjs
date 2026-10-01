import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeFederatedMetadata, detectFederationConflicts } from '../lib/catalog/metadata-federation.ts'
import { normalizeLineagePayload } from '../lib/governance/lineage-adapters.ts'
import { scanSourceArtifact } from '../lib/connectors/source-artifact-scanner.ts'
import { normalizeBiMetadata } from '../lib/connectors/bi-metadata.ts'

test('metadata federation preserves provenance and detects competing descriptions',()=>{
  const records=normalizeFederatedMetadata({items:[
    {id:'a',namespace:'sales',name:'customer',description:'Customer master',authority:'SOURCE'},
    {id:'b',namespace:'sales',name:'customer',description:'Customer subject area',authority:'EXTERNAL_CATALOG'},
  ]},'catalog-a')
  assert.equal(records.length,2)
  assert.equal(records[0].sourceCatalog,'catalog-a')
  const conflicts=detectFederationConflicts(records)
  assert.equal(conflicts.length,1)
  assert.equal(conflicts[0].descriptionConflict,true)
})

test('requested ETL and source-code lineage systems normalize through canonical adapter',()=>{
  for(const integrationType of ['INFORMATICA','BOOMI','SSIS','LOOKER','NODEJS','DOTNET','VBA']){
    const result=normalizeLineagePayload({integrationType,relationships:[{id:'1',source:'raw.customer',target:'curated.customer',operation:'MAP',expression:'customer_id'}]})
    assert.equal(result.sourceSystem,integrationType)
    assert.equal(result.events.length,1)
    assert.equal(result.events[0].inputs.length,1)
    assert.equal(result.events[0].outputs.length,1)
  }
})

test('runtime persona preview remains restricted to governance admin or organization admin',()=>{
  const page=fs.readFileSync('app/home/[persona]/page.tsx','utf8')
  assert.match(page,/access\.persona === 'data-governance-admin'/)
  assert.match(page,/\^\(OWNER\|ADMIN\)\$/)
  assert.match(page,/slug !== access\.persona && !canSwitchPersona/)
})

test('copilot has governed deterministic degradation instead of 503-only provider failure',()=>{
  const route=fs.readFileSync('app/api/ai/copilot/chat/route.ts','utf8')
  assert.match(route,/datanexus_governed_evidence_fallback/)
  assert.match(route,/degraded: true/)
  assert.doesNotMatch(route,/AI_PROVIDER_UNAVAILABLE[^\n]{0,300}status: 503/)
})

test('embedded job monitor consumes durable discovery and DQ jobs',()=>{
  const route=fs.readFileSync('app/api/monitoring/runs/route.ts','utf8')
  const panel=fs.readFileSync('components/monitoring/recent-job-monitor.tsx','utf8')
  assert.match(route,/job_queue/)
  assert.match(route,/DISCOVERY/)
  assert.match(route,/DATA_QUALITY/)
  assert.match(panel,/visibleJobs/)
  assert.match(panel,/Attempt \{job\.attempts\}/)
})

test('metadata proposal endpoint is workflow-only and does not apply direct mutation',()=>{
  const route=fs.readFileSync('app/api/catalog/[datasetId]/proposal/route.ts','utf8')
  assert.match(route,/CATALOG_METADATA_CHANGE_APPROVAL/)
  assert.match(route,/start_workflow/)
  assert.match(route,/direct_mutation_performed:false/)
  assert.doesNotMatch(route,/dataset_catalog'\)\.update|dataset_catalog'\)\.upsert/)
})

test('lineage explorer includes flow and mapping visualization modes',()=>{
  const explorer=fs.readFileSync('app/lineage/lineage-explorer.tsx','utf8')
  assert.match(explorer,/viewMode/)
  assert.match(explorer,/Flow view/)
  assert.match(explorer,/transformationGroups/)
})


test('source artifact scanner extracts database reads and writes without leaking secret evidence',()=>{
  const result=scanSourceArtifact({kind:'NODEJS',path:'jobs/customer.js',content:'const password="secret123"; db.query("insert into curated.customer select * from raw.customer")'})
  assert.ok(result.references.some(item=>item.kind==='READ'&&item.target.toLowerCase()==='raw.customer'))
  assert.ok(result.references.some(item=>item.kind==='WRITE'&&item.target.toLowerCase()==='curated.customer'))
  assert.ok(result.transformations.some(item=>item.target?.toLowerCase()==='curated.customer'))
  assert.ok(result.references.every(item=>!item.evidence.includes('secret123')))
})

test('BI metadata adapter normalizes Power BI Tableau and Looker assets',()=>{
  for(const provider of ['POWER_BI','TABLEAU','LOOKER']){
    const assets=normalizeBiMetadata(provider,{items:[{id:'1',type:'semantic model',name:'Customer Model',workspace:'Finance',sources:['warehouse.customer']}]})
    assert.equal(assets.length,1)
    assert.equal(assets[0].provider,provider)
    assert.equal(assets[0].assetType,'SEMANTIC_MODEL')
    assert.deepEqual(assets[0].upstream,['warehouse.customer'])
  }
})


test('manual lineage corrections are approval-gated and workspace-protected',()=>{
  const route=fs.readFileSync('app/api/lineage/corrections/route.ts','utf8')
  const page=fs.readFileSync('app/lineage/corrections/page.tsx','utf8')
  const policy=fs.readFileSync('lib/governance/workspace-policy.ts','utf8')
  assert.match(route,/LINEAGE_MANUAL_CORRECTION/)
  assert.match(route,/status!=='APPROVED'/)
  assert.match(route,/upsert_manual_lineage_edge/)
  assert.match(route,/HUMAN_APPROVED_MANUAL/)
  assert.match(page,/requireWorkspaceAccess\('lineage-manage'\)/)
  assert.match(policy,/\['\/lineage\/corrections', 'lineage-manage'\]/)
})


test('business metadata history is immutable and rollback creates a new governed version',()=>{
  const migration=fs.readFileSync('supabase/migrations/20261001233000_dataset_catalog_version_history.sql','utf8')
  const api=fs.readFileSync('app/api/catalog/[datasetId]/history/route.ts','utf8')
  assert.match(migration,/dataset_catalog_history/)
  assert.match(migration,/capture_dataset_catalog_history/)
  assert.match(migration,/restore_dataset_catalog_history/)
  assert.match(migration,/certification_state_preserved/)
  assert.match(migration,/CATALOG_METADATA_ROLLED_BACK/)
  assert.match(api,/authorizeDataset\(user\.id,datasetId,'catalog\.update'\)/)
})
test('metadata discovery emits explicit schema drift evidence and keeps external notifications opt-in',()=>{
  const discovery=fs.readFileSync('lib/catalog/discovery.ts','utf8')
  assert.match(discovery,/METADATA_SCHEMA_CHANGE_DETECTED/)
  assert.match(discovery,/SCHEMA_DRIFT/)
  assert.match(discovery,/METADATA_CHANGE_NOTIFICATIONS_ENABLED/)
  assert.match(discovery,/queueAlertNotifications/)
})
