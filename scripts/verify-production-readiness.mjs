import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing production-readiness artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing production-readiness contract: ${pattern}`)
  }
}

requireText('supabase/migrations/20260904194020_production_slo_and_readiness_evidence.sql', [
  'production_slo_policies',
  'production_readiness_runs',
  'max_api_p95_ms',
  'max_api_p99_ms',
  'max_error_rate',
  'max_projection_lag_seconds',
  'max_dead_job_rate',
  'production_readiness_select',
])
requireText('supabase/migrations/20260905023109_ignore_superseded_dead_jobs_in_platform_health.sql', [
  'recovered.project_id=dead.project_id',
  'recovered.job_type=dead.job_type',
  'recovered.entity_id is not distinct from dead.entity_id',
  "recovered.status='SUCCEEDED'",
  "'UNRESOLVED_ONLY'",
  "'PRESERVED_AUDIT_HISTORY'",
  'superseded_dead_jobs_last_24h',
])
requireText('lib/platform/production-readiness.ts', [
  'getDataPlaneProviderHealth',
  'listProjectionConsumerHealth',
  'DATA_PLANE_PROVIDERS',
  'PROJECTION_HEALTH',
  'DURABLE_JOB_HEALTH',
  'RECOVERY_DRILL',
  'HTTP_BENCHMARK',
  'PLATFORM_CONTRACTS',
  'production_readiness_runs',
])
requireText('app/api/platform/[projectId]/readiness/route.ts', [
  "authorizeProject(user.id, projectId, 'admin.manage')",
  'evaluateProductionReadiness',
  'persistProductionReadiness',
])
requireText('scripts/benchmark-production.mjs', [
  'BENCHMARK_MAX_P95_MS',
  'BENCHMARK_MAX_P99_MS',
  'BENCHMARK_MAX_ERROR_RATE',
  'BENCHMARK_MIN_SUCCESSFUL_REQUESTS',
  "gate_name: 'HTTP_BENCHMARK'",
  'READINESS_PROJECT_ID',
  'readinessEvidence',
])
requireText('scripts/recovery-drill.mjs', [
  'assertIsolated',
  'assertSnapshotParity',
  'auditChainValid',
  'backup_restore_drills',
  'RECOVERY_DATABASE_URL',
])
requireText('app/api/health/ready/route.ts', [
  'checkDatabricksConnector',
  "dgp-databricks-connector",
  "drivers.includes('databricks')",
  "payload.credential_store === 'supabase-vault'",
  "payload.metadata_provider === 'unity-catalog-rest'",
  "payload.query_provider === 'statement-execution-api'",
  "lineageProviders.includes('system.access.table_lineage')",
  "lineageProviders.includes('system.access.column_lineage')",
  'components.databricks_connector',
  'checkJdbcBridge',
  'JDBC_BRIDGE_URL',
  'JDBC_BRIDGE_TOKEN',
  'datanexus-jdbc-bridge',
  'components.jdbc_bridge',
  'Native PostgreSQL and Databricks connectors remain available',
])
requireText('supabase/functions/dgp-databricks-connector/index.ts', [
  'supabase-vault',
  'unity-catalog-rest',
  'statement-execution-api',
  'system.access.table_lineage',
  'system.access.column_lineage',
  'source_column_name',
  'target_column_name',
  'DATABRICKS_SYSTEM_LINEAGE_RECORD',
])
requireText('app/api/datasets/source/credentials/route.ts', [
  "isDatabricks(connectionKind, jdbcUrl)",
  "dgp-databricks-connector",
  "connector: 'supabase-edge-databricks'",
])
requireText('lib/connectors/jdbc.ts', [
  "DATABRICKS_EDGE_FUNCTION = 'dgp-databricks-connector'",
  'isDatabricksJdbcUrl',
  'databricksEdgeRequest',
  'columnMappings?: JdbcColumnMapping[]',
])
requireText('lib/catalog/discovery.ts', [
  'discoverJdbcFromNativeHierarchy',
  "rpc('publish_discovery_revision'",
  "jobType: 'LINEAGE_ENRICHMENT'",
  'enqueueDurableJob',
  'lineage-enrichment:${input.catalogRevisionId}',
  "status: 'INCOMPLETE'",
])
requireText('lib/catalog/lineage-enrichment.ts', [
  'discoverJdbcTransformations',
  "engine === 'DATABRICKS'",
  'system.access.column_lineage',
  "rpc('ingest_lineage_batch_atomic'",
  "from('lineage_column_mappings')",
  'authoritative_source',
  'columnMappings',
])
requireText('lib/orchestration/worker.ts', [
  "job.job_type === 'LINEAGE_ENRICHMENT'",
  'executeLineageEnrichment',
  'discoveryRunId',
])
requireText('lib/orchestration/queue.ts', [
  "'LINEAGE_ENRICHMENT'",
  'enqueueDurableJob',
])
requireText('supabase/migrations/20260905193000_lineage_enrichment_durable_job.sql', [
  "'LINEAGE_ENRICHMENT'::text",
  'job_queue_job_type_check',
])
requireText('app/api/datasets/source/discover/route.ts', [
  'discoverNativeHierarchy',
  'hierarchy_node_count',
  'native_terms',
])
requireText('app/api/datasets/source/register/route.ts', [
  'discoverNativeHierarchy',
  'hierarchy_selection',
  'native_hierarchy',
  'credential_ref',
  'parts.catalog',
])
requireText('lib/connectors/native-hierarchy-discovery.ts', [
  "NATIVE_EDGE_FUNCTION = 'dgp-native-hierarchy-connector'",
  '/v1/hierarchy',
  'JDBC_BRIDGE_URL',
  'JDBC_BRIDGE_TOKEN',
  'rejectEmbeddedCredentials',
])
requireText('supabase/functions/dgp-native-hierarchy-connector/index.ts', [
  'supabase-vault',
  'unity-catalog/catalogs',
  'pg_namespace',
  'pg_class',
  'pg_attribute',
])
requireText('lib/profiling/source-validation.ts', [
  'catalogFromJdbcUrl',
  'jdbcTargetFromSourceIdentifier',
  'JDBC source catalog contains invalid identifier characters.',
  'catalog, schema, table',
  'validateJdbcConnection({ jdbcUrl: jdbcUrl!, credentialRef: credentialRef!, schema, table: table!, catalog })',
])
requireText('app/api/datasets/source/validate/route.ts', [
  'metadata.catalog',
  'jdbc-table://${catalog ? `${catalog}.` : \'\'}${schema}.${table}',
])
requireText('app/api/datasets/source/[sourceId]/route.ts', [
  'catalog: metadata.catalog',
])

console.log('Production readiness contracts verified.')
