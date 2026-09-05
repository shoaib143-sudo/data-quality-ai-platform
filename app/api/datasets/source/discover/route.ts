import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function validCredentialRef(value: string) { return /^DGP_[A-Za-z0-9_]+$/.test(value) }
function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const jdbcUrl = text(body.jdbcUrl)
    const credentialRef = text(body.credentialRef)
    const connectionKind = text(body.connectionKind) || 'jdbc'

    if (!projectId || !jdbcUrl || !credentialRef) {
      return NextResponse.json({ error: 'Project, connection string, and database credentials are required.', code: 'INVALID_DISCOVERY_REQUEST' }, { status: 400 })
    }
    if (!validCredentialRef(credentialRef)) {
      return NextResponse.json({ error: 'The connection credentials are invalid or expired.', code: 'INVALID_CREDENTIAL_REF' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.read')

    try {
      const hierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef })
      const capabilities = record(hierarchy.details.capabilities)
      const schemas = hierarchy.nodes.filter(node => node.kind === 'SCHEMA').map(node => node.name)
      const tables = hierarchy.nodes.filter(node => node.kind === 'OBJECT').map(node => ({
        name: node.name,
        type: node.objectType ?? node.nativeType,
        nativeId: node.nativeId ?? null,
        catalog: node.catalog ?? null,
        schema: node.schema ?? null,
        qualifiedName: node.qualifiedName,
      }))
      return NextResponse.json({
        hierarchy,
        schemas,
        tables,
        capabilities,
        details: {
          ...hierarchy.details,
          database_product: hierarchy.databaseProduct,
          database_version: hierarchy.databaseVersion,
          native_terms: hierarchy.terms,
          hierarchy_node_count: hierarchy.nodes.length,
          hierarchy_truncated: hierarchy.truncated,
          capabilities,
        },
      })
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Native database hierarchy discovery failed.',
        code: 'NATIVE_HIERARCHY_DISCOVERY_FAILED',
        connectionKind,
      }, { status: 502 })
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message, code: 'PROJECT_ACCESS_DENIED' }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Native database hierarchy discovery failed.', code: 'DISCOVERY_REQUEST_FAILED' }, { status: 400 })
  }
}
