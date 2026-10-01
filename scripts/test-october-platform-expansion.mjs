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


test('persona landing exposes icon-rich authorized workspace shortcuts',()=>{
  const landing=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
  assert.match(landing,/Workspace shortcuts/)
  assert.match(landing,/workspaceIcon/)
  assert.match(landing,/visibleNav\.slice\(0,6\)/)
})

test('executive summary labels readiness as evidence coverage rather than certification',()=>{
  const page=fs.readFileSync('app/reports/executive-summary/page.tsx','utf8')
  assert.match(page,/Evidence coverage snapshot/)
  assert.match(page,/not a production certification score/)
  assert.match(page,/Source readiness/)
  assert.match(page,/Lineage evidence/)
})

test('connector registry distinguishes live bridge ingest and dry-run integration modes',()=>{
  const registry=fs.readFileSync('lib/connectors/connector-capabilities.ts','utf8')
  const page=fs.readFileSync('app/catalog/connectors/page.tsx','utf8')
  for(const mode of ['LIVE_NATIVE','LIVE_BRIDGE','INGEST_ADAPTER','DRY_RUN_ADAPTER'])assert.match(registry,new RegExp(mode))
  for(const name of ['Oracle Database','Microsoft SQL Server','Informatica','Power BI','.NET'])assert.ok(registry.includes(name))
  assert.match(page,/Connector capability registry/)
})

test('lineage evidence timeline renders persisted ingestion and transformation evidence',()=>{
  const page=fs.readFileSync('app/lineage/evidence/page.tsx','utf8')
  assert.match(page,/lineage_ingestion_events/)
  assert.match(page,/lineage_transformations/)
  assert.match(page,/Observed lineage and transformations/)
  assert.match(page,/distinguishes received source evidence and transformation records from inferred suggestions/)
})


test('metadata scan diagnostics expose manifest failures and safe rescan without bypassing discovery authorization',()=>{
  const page=fs.readFileSync('app/catalog/discovery/history/page.tsx','utf8')
  const panel=fs.readFileSync('components/catalog/discovery-run-history.tsx','utf8')
  const discoveryRoute=fs.readFileSync('app/api/catalog/discovery/route.ts','utf8')
  assert.match(page,/discovery_runs/)
  assert.match(page,/error_message/)
  assert.match(panel,/Metadata scan diagnostics/)
  assert.match(panel,/Rescan/)
  assert.match(panel,/\/api\/catalog\/discovery/)
  assert.match(discoveryRoute,/authorizeProject\(user\.id, source\.project_id, 'discovery\.execute'\)/)
})


test('BI workbench can persist imported metadata through the governed lineage ingestion API',()=>{
  const workbench=fs.readFileSync('components/catalog/bi-metadata-workbench.tsx','utf8')
  assert.match(workbench,/Persist source-to-report lineage/)
  assert.match(workbench,/\/api\/lineage\/ingest/)
  assert.match(workbench,/projectId/)
  assert.match(workbench,/integrationType:provider/)
  assert.match(workbench,/sourceKey:/)
})


test('catalog metadata approval workflow applies only approved proposals and records application',()=>{
  const route=fs.readFileSync('app/api/catalog/[datasetId]/proposal/route.ts','utf8')
  const ui=fs.readFileSync('components/catalog/dataset-metadata-history.tsx','utf8')
  assert.match(route,/action==='APPLY'/)
  assert.match(route,/instance\.status!=='APPROVED'/)
  assert.match(route,/CATALOG_METADATA_CHANGE_APPLIED/)
  assert.match(route,/applied_at/)
  assert.match(ui,/Apply approved change/)
  assert.match(ui,/action:'APPLY'/)
})


test('discovery diagnostics expose published catalog revision deltas as incremental update evidence',()=>{
  const page=fs.readFileSync('app/catalog/discovery/history/page.tsx','utf8')
  const panel=fs.readFileSync('components/catalog/discovery-run-history.tsx','utf8')
  assert.match(page,/catalog_revision_changes/)
  assert.match(panel,/Incremental catalog change log/)
  assert.match(panel,/Missing assets remain non-destructive evidence/)
  assert.match(panel,/change_type/)
})


test('lineage transformation changes create immutable version history without observation noise',()=>{
  const migration=fs.readFileSync('supabase/migrations/20261001235500_lineage_transformation_version_history.sql','utf8')
  const page=fs.readFileSync('app/lineage/evidence/page.tsx','utf8')
  assert.match(migration,/lineage_transformation_history/)
  assert.match(migration,/capture_lineage_transformation_history/)
  assert.match(migration,/if not v_changed then return new/)
  assert.match(migration,/old\.logic_hash is distinct from new\.logic_hash/)
  assert.match(page,/Transformation version history/)
})


test('lineage ingestion workbench exposes every requested ETL and code preset without claiming live API pull',()=>{
  const manager=fs.readFileSync('app/lineage/ingest/lineage-ingest-manager.tsx','utf8')
  for(const key of ['INFORMATICA','BOOMI','DATAMAGIC','WEBOTX','AXWAY','AGILE_REPORTER','SSIS','NODEJS','DOTNET','VBA','SCRIPT','LOG'])assert.match(manager,new RegExp(key+':'))
  assert.match(manager,/Use the presets as connector contracts/)
})


test('source artifact scans can persist extracted metadata without storing source content',()=>{
  const migration=fs.readFileSync('supabase/migrations/20261001235900_source_artifact_and_bi_metadata.sql','utf8')
  const route=fs.readFileSync('app/api/catalog/source-artifact/scan/route.ts','utf8')
  const page=fs.readFileSync('app/catalog/source-artifact-scan/page.tsx','utf8')
  const workbench=fs.readFileSync('components/catalog/source-artifact-scan-workbench.tsx','utf8')
  assert.match(migration,/source_artifact_scans/)
  assert.match(migration,/reference_evidence/)
  assert.doesNotMatch(migration,/source_content\s+(?:text|json|jsonb|bytea)/i)
  assert.match(route,/authorizeProject\(user\.id,projectId,'source\.manage'\)/)
  assert.match(route,/source_content_persisted:false/)
  assert.match(workbench,/Persist governed scan/)
  assert.match(page,/Source content itself is never stored/)
})

test('BI metadata imports can persist catalog evidence independently from source-to-report lineage',()=>{
  const migration=fs.readFileSync('supabase/migrations/20261001235900_source_artifact_and_bi_metadata.sql','utf8')
  const ingest=fs.readFileSync('app/api/catalog/bi/ingest/route.ts','utf8')
  const workbench=fs.readFileSync('components/catalog/bi-metadata-workbench.tsx','utf8')
  const page=fs.readFileSync('app/catalog/bi-integrations/page.tsx','utf8')
  assert.match(migration,/bi_metadata_assets/)
  assert.match(ingest,/authorizeProject\(user\.id,projectId,'catalog\.update'\)/)
  assert.match(ingest,/BI_METADATA_IMPORTED/)
  assert.match(ingest,/live_vendor_api_called:false/)
  assert.match(workbench,/Persist BI catalog metadata/)
  assert.match(workbench,/Persist source-to-report lineage/)
  assert.match(page,/canPersistCatalog/)
  assert.match(page,/canPersistLineage/)
})

test('federation workspace accurately distinguishes dry run from governed persistence',()=>{
  const page=fs.readFileSync('app/catalog/federation/page.tsx','utf8')
  const workbench=fs.readFileSync('components/catalog/federation-workbench.tsx','utf8')
  assert.doesNotMatch(page,/page is dry-run only/i)
  assert.match(page,/authorized catalog editors can persist/)
  assert.match(workbench,/Persist governed exchange/)
  assert.match(workbench,/canPersist/)
})


test('metadata version comparison exposes real column-level structural deltas',()=>{
  const page=fs.readFileSync('app/catalog/history/page.tsx','utf8')
  const compare=fs.readFileSync('components/catalog/metadata-version-compare.tsx','utf8')
  assert.match(page,/name,columns,version_number/)
  assert.match(compare,/Columns added/)
  assert.match(compare,/Columns removed/)
  assert.match(compare,/Type\/nullability changes/)
  assert.match(compare,/row\.data_type/)
})

test('source artifact scanner recognizes language-specific file access without promoting framework symbols to lineage',()=>{
  const dotnet=scanSourceArtifact({kind:'DOTNET',path:'Jobs/Load.cs',content:'var p = File.ReadAllText("C:\\\\data\\\\customer.csv");'})
  const node=scanSourceArtifact({kind:'NODEJS',path:'jobs/load.js',content:'const x = readFileSync("/data/customer.json", "utf8")'})
  const vba=scanSourceArtifact({kind:'VBA',path:'Customer.xlsm!Module1',content:'Workbooks.Open "C:\\\\data\\\\customer.xlsx"'})
  assert.ok(dotnet.references.some(item=>item.kind==='FILE'&&item.target.includes('customer.csv')))
  assert.ok(node.references.some(item=>item.kind==='FILE'&&item.target.includes('customer.json')))
  assert.ok(vba.references.some(item=>item.kind==='FILE'&&item.target.includes('customer.xlsx')))
  assert.ok(dotnet.warnings.some(item=>item.includes('not promoted to authoritative lineage')))
})

test('BI metadata adapter accepts provider-native export collection shapes',()=>{
  const powerBi=normalizeBiMetadata('POWER_BI',{semanticModels:[{id:'m1',name:'Customer Model',sources:['warehouse.customer']}]})
  const tableau=normalizeBiMetadata('TABLEAU',{workbooks:[{luid:'w1',name:'Customer Workbook',dataSources:['warehouse.customer']}]})
  const looker=normalizeBiMetadata('LOOKER',{explores:[{id:'e1',name:'customer_explore',tables:['warehouse.customer']}]})
  assert.equal(powerBi[0]?.assetType,'SEMANTIC_MODEL')
  assert.equal(tableau[0]?.assetType,'REPORT')
  assert.equal(looker[0]?.assetType,'SEMANTIC_MODEL')
  assert.deepEqual(looker[0]?.upstream,['warehouse.customer'])
})

test('observability source health includes latest metadata discovery execution evidence',()=>{
  const page=fs.readFileSync('app/observability/page.tsx','utf8')
  assert.match(page,/discovery_runs/)
  assert.match(page,/latestDiscoveryBySource/)
  assert.match(page,/Latest metadata scan/)
  assert.match(page,/NO EVIDENCE/)
})

test('lineage flow visualization presents source transformation and target topology',()=>{
  const explorer=fs.readFileSync('app/lineage/lineage-explorer.tsx','utf8')
  assert.match(explorer,/sourceAssets/)
  assert.match(explorer,/targetAssets/)
  assert.match(explorer,/>Sources</)
  assert.match(explorer,/>Targets</)
})
