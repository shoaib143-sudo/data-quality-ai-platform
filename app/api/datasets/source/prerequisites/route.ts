import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'

const SUPPORTED = ['csv', 'postgresql', 'mssql', 'mysql', 'databricks', 'jdbc'] as const
type ConnectionKind = (typeof SUPPORTED)[number]

const DEFINITIONS: Record<ConnectionKind, { label: string; requirements: Array<{ key: string; label: string; description: string; source: 'user' | 'server' }> }> = {
  csv: {
    label: 'CSV File',
    requirements: [
      { key: 'source_uri', label: 'CSV URL or storage path', description: 'HTTPS CSV URL or an accessible Supabase Storage bucket/path.', source: 'user' },
      { key: 'file_access', label: 'File accessible', description: 'The platform must be able to read the CSV at validation time.', source: 'user' },
    ],
  },
  postgresql: {
    label: 'PostgreSQL',
    requirements: [
      { key: 'jdbc_url', label: 'PostgreSQL JDBC URL', description: 'Host, port and database must be present in a credential-free JDBC URL.', source: 'user' },
      { key: 'credential_ref', label: 'Server managed credential', description: 'A PostgreSQL credential reference must be configured server-side.', source: 'server' },
      { key: 'bridge', label: 'JDBC bridge', description: 'The server must have a secure HTTPS JDBC bridge and bridge token configured.', source: 'server' },
      { key: 'schema', label: 'Schema', description: 'Select a schema after catalog discovery.', source: 'user' },
      { key: 'table', label: 'Table or view', description: 'Select the profiling target after schema discovery.', source: 'user' },
    ],
  },
  mssql: {
    label: 'Microsoft SQL Server',
    requirements: [
      { key: 'jdbc_url', label: 'SQL Server JDBC URL', description: 'Server, port and database must be present in a credential-free JDBC URL.', source: 'user' },
      { key: 'credential_ref', label: 'Server managed credential', description: 'A SQL Server credential reference must be configured server-side.', source: 'server' },
      { key: 'bridge', label: 'JDBC bridge', description: 'The server must have a secure HTTPS JDBC bridge and bridge token configured.', source: 'server' },
      { key: 'schema', label: 'Schema', description: 'Select a schema after catalog discovery.', source: 'user' },
      { key: 'table', label: 'Table or view', description: 'Select the profiling target after schema discovery.', source: 'user' },
    ],
  },
  mysql: {
    label: 'MySQL',
    requirements: [
      { key: 'jdbc_url', label: 'MySQL JDBC URL', description: 'Host, port and database must be present in a credential-free JDBC URL.', source: 'user' },
      { key: 'credential_ref', label: 'Server managed credential', description: 'A MySQL credential reference must be configured server-side.', source: 'server' },
      { key: 'bridge', label: 'JDBC bridge', description: 'The server must have a secure HTTPS JDBC bridge and bridge token configured.', source: 'server' },
      { key: 'schema', label: 'Schema', description: 'Select a schema after catalog discovery.', source: 'user' },
      { key: 'table', label: 'Table or view', description: 'Select the profiling target after schema discovery.', source: 'user' },
    ],
  },
  databricks: {
    label: 'Databricks Unity Catalog',
    requirements: [
      { key: 'jdbc_url', label: 'Databricks JDBC URL', description: 'Workspace host and required Databricks connection parameters must be present without embedded secrets.', source: 'user' },
      { key: 'credential_ref', label: 'Server managed credential', description: 'A Databricks credential reference must be configured server-side.', source: 'server' },
      { key: 'bridge', label: 'JDBC bridge', description: 'The server must have a secure HTTPS JDBC bridge and bridge token configured.', source: 'server' },
      { key: 'catalog', label: 'Catalog', description: 'Select the Unity Catalog target where supported by the bridge.', source: 'user' },
      { key: 'schema', label: 'Schema', description: 'Select a schema after catalog discovery.', source: 'user' },
      { key: 'table', label: 'Table', description: 'Select the profiling target after schema discovery.', source: 'user' },
    ],
  },
  jdbc: {
    label: 'Generic JDBC',
    requirements: [
      { key: 'jdbc_url', label: 'JDBC URL', description: 'A supported credential-free JDBC endpoint is required.', source: 'user' },
      { key: 'credential_ref', label: 'Server managed credential', description: 'A credential reference must be configured server-side for the selected driver.', source: 'server' },
      { key: 'bridge', label: 'JDBC bridge', description: 'The server must have a secure HTTPS JDBC bridge and bridge token configured.', source: 'server' },
      { key: 'schema', label: 'Schema', description: 'Select a schema after catalog discovery.', source: 'user' },
      { key: 'table', label: 'Table or view', description: 'Select the profiling target after schema discovery.', source: 'user' },
    ],
  },
}

function serverCredentialRef(kind: ConnectionKind) {
  const normalized = kind.replace(/[^a-z0-9]+/g, '_').toUpperCase()
  return process.env[`JDBC_${normalized}_CREDENTIAL_REF`]?.trim() || process.env.JDBC_CREDENTIAL_REF?.trim() || ''
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const kind = new URL(request.url).searchParams.get('connectionKind')?.trim().toLowerCase() as ConnectionKind | undefined
    if (!kind || !SUPPORTED.includes(kind)) {
      return NextResponse.json({ error: 'Unsupported connection type.', code: 'UNSUPPORTED_CONNECTION_TYPE' }, { status: 400 })
    }

    const definition = DEFINITIONS[kind]
    const bridgeConfigured = Boolean(process.env.JDBC_BRIDGE_URL?.trim() && process.env.JDBC_BRIDGE_TOKEN?.trim())
    const credentialConfigured = kind === 'csv' ? true : Boolean(serverCredentialRef(kind))

    return NextResponse.json({
      connectionKind: kind,
      label: definition.label,
      requirements: definition.requirements,
      checks: {
        bridgeConfigured: kind === 'csv' ? true : bridgeConfigured,
        credentialConfigured,
      },
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load connection prerequisites.', code: 'PREREQUISITES_REQUEST_FAILED' }, { status: 401 })
  }
}
