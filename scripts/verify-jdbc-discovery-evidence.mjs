import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906142000_expose_jdbc_discovery_evidence.sql'
const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase()
const discoveryPage = fs.readFileSync('app/catalog/discovery/page.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`JDBC discovery evidence contract missing: ${label}`)
}

requireText(migration, 'catalog.jdbc_discovery_evidence', 'governed read projection')
requireText(migration, 'security_invoker = true', 'security-invoker projection')
requireText(migration, 'catalog.verify_jdbc_discovery_evidence', 'evidence consistency verifier')
requireText(migration, 'catalog.verify_jdbc_source_acceptance', 'production acceptance authority remains explicit')
requireText(migration, 'identity_unique_and_complete', 'stable identity evidence')
requireText(migration, 'catalog_projection_complete', 'published catalog projection evidence')
requireText(migration, 'multi_namespace_observed', 'multiple namespace evidence')
requireText(migration, 'repeat_scan_evidence_present', 'repeat scan evidence')
requireText(migration, 'repeat_scan_stable', 'repeat scan stability evidence')
requireText(migration, 'observed_jdbc_discovery_evidence_does_not_mutate_source_configuration', 'authority semantic')
requireText(migration, "where ds.source_type::text = 'jdbc'", 'JDBC-only projection scope')
requireText(migration, 'grant select on catalog.jdbc_discovery_evidence to authenticated, service_role', 'read-only operator access')
requireText(migration, 'revoke insert, update, delete, truncate, references, trigger on catalog.jdbc_discovery_evidence from authenticated, service_role', 'mutation privileges revoked')

requireText(discoveryPage, "from('jdbc_discovery_evidence')", 'Discovery UI consumes governed projection')
requireText(discoveryPage, 'JDBC discovery evidence', 'operator evidence panel')
requireText(discoveryPage, 'Multiple namespaces', 'namespace breadth is visible')
requireText(discoveryPage, 'Repeat scan', 'repeat-scan evidence is visible')
requireText(discoveryPage, 'Stable identities', 'identity evidence is visible')
requireText(discoveryPage, 'Acceptance remains enforced separately', 'UI does not conflate evidence with acceptance authority')

console.log('Governed JDBC discovery evidence contract verified.')
