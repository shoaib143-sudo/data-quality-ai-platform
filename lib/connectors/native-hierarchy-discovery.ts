import { createAdminClient } from '@/lib/supabase/admin'
import type { NativeHierarchyNode, NativeHierarchyResult, NativeHierarchyTerms } from './native-hierarchy'

const NATIVE_EDGE_FUNCTION = 'dgp-native-hierarchy-connector'
const DEFAULT_TIMEOUT_MS = 60_000

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim()
}

function rejectEmbeddedCredentials(jdbcUrl: string) {
  const authorityCredentials = /jdbc:[^:]+:\/\/[^/\s@]+@/i
  const credentialProperty = /(?:[?&;])(?:user(?:name)?|uid|password|passwd|pwd|pass|token|access_token|accesstoken|secret|client_secret)=/i
  const oracleThinCredentials = /^jdbc:oracle:thin:[^:@/\s]+(?:\/[^@\s]+)?@/i
  if (authorityCredentials.test(jdbcUrl) || credentialProperty.test(jdbcUrl) || oracleThinCredentials.test(jdbcUrl)) {
    throw new Error('JDBC URL must not contain embedded credentials; use credentialRef.')
  }
}

function builtInHierarchy(jdbcUrl: string) {
  const value = jdbcUrl.toLowerCase()
  return value.startsWith('jdbc:postgresql://') || value.startsWith('jdbc:databricks://')
}

function bridgeBaseUrl() {
  const raw = requiredString(process.env.JDBC_BRIDGE_URL, 'JDBC_BRIDGE_URL')
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('JDBC bridge URL must use HTTPS.')
  const blocked = new Set(['localhost', 'localhost.localdomain', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'])
  if (blocked.has(url.hostname.toLowerCase())) throw new Error('JDBC bridge URL cannot target a local or cloud metadata host.')
  if (url.username || url.password) throw new Error('JDBC bridge URL must not contain embedded credentials.')
  return raw.replace(/\/$/, '')
}

async function bridgeHierarchy(jdbcUrl: string, credentialRef: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${bridgeBaseUrl()}/v1/hierarchy`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${requiredString(process.env.JDBC_BRIDGE_TOKEN, 'JDBC_BRIDGE_TOKEN')}`,
      },
      body: JSON.stringify({ jdbcUrl, credentialRef }),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload && typeof payload.error === 'string' ? payload.error : `JDBC hierarchy bridge returned HTTP ${response.status}.`)
    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Native hierarchy discovery timed out.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function edgeHierarchy(jdbcUrl: string, credentialRef: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke(NATIVE_EDGE_FUNCTION, {
    body: { jdbc_url: jdbcUrl, credential_ref: credentialRef },
  })
  if (error) {
    let message = error.message || 'Native hierarchy connector request failed.'
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error.trim()
      } catch {}
    }
    throw new Error(message)
  }
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  if (typeof payload.error === 'string') throw new Error(payload.error)
  return payload
}

function normalizeTerms(value: unknown): NativeHierarchyTerms {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const nullable = (item: unknown) => typeof item === 'string' && item.trim() ? item.trim() : null
  return {
    root: nullable(source.root) ?? 'connection',
    catalog: nullable(source.catalog),
    schema: nullable(source.schema),
    object: nullable(source.object) ?? 'object',
    field: nullable(source.field) ?? 'column',
  }
}

function normalizeNode(value: unknown): NativeHierarchyNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const name = typeof source.name === 'string' ? source.name : ''
  const qualifiedName = typeof source.qualifiedName === 'string' ? source.qualifiedName : ''
  const kind = typeof source.kind === 'string' ? source.kind.toUpperCase() : ''
  if (!id || !name || !qualifiedName || !['ROOT','CATALOG','DATABASE','SCHEMA','OBJECT','FIELD','NAMESPACE'].includes(kind)) return null
  const text = (key: string) => typeof source[key] === 'string' && String(source[key]).trim() ? String(source[key]).trim() : null
  return {
    id,
    parentId: text('parentId'),
    kind: kind as NativeHierarchyNode['kind'],
    nativeType: text('nativeType') ?? kind,
    name,
    qualifiedName,
    selectable: source.selectable !== false,
    hasChildren: source.hasChildren === true,
    catalog: text('catalog'),
    schema: text('schema'),
    object: text('object'),
    objectType: text('objectType'),
    dataType: text('dataType'),
    ordinal: typeof source.ordinal === 'number' ? source.ordinal : null,
    system: source.system === true,
    metadata: source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata as Record<string, unknown> : {},
  }
}

function normalizeHierarchy(payload: unknown): NativeHierarchyResult {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const nodes = Array.isArray(source.nodes) ? source.nodes.map(normalizeNode).filter((item): item is NativeHierarchyNode => Boolean(item)) : []
  if (!nodes.length) throw new Error('The connector returned no native hierarchy nodes.')
  const databaseProduct = typeof source.databaseProduct === 'string' && source.databaseProduct.trim() ? source.databaseProduct.trim() : 'Unknown database'
  const rootIds = Array.isArray(source.rootIds)
    ? source.rootIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : nodes.filter(node => node.parentId === null).map(node => node.id)
  return {
    databaseProduct,
    databaseVersion: typeof source.databaseVersion === 'string' && source.databaseVersion.trim() ? source.databaseVersion.trim() : null,
    terms: normalizeTerms(source.terms),
    nodes,
    rootIds,
    warnings: Array.isArray(source.warnings) ? source.warnings.filter((item): item is string => typeof item === 'string') : [],
    truncated: source.truncated === true,
    details: source.details && typeof source.details === 'object' && !Array.isArray(source.details) ? source.details as Record<string, unknown> : {},
  }
}

export async function discoverNativeHierarchy(input: { jdbcUrl: string; credentialRef: string }): Promise<NativeHierarchyResult> {
  const jdbcUrl = requiredString(input.jdbcUrl, 'jdbcUrl')
  const credentialRef = requiredString(input.credentialRef, 'credentialRef')
  rejectEmbeddedCredentials(jdbcUrl)
  const payload = builtInHierarchy(jdbcUrl)
    ? await edgeHierarchy(jdbcUrl, credentialRef)
    : await bridgeHierarchy(jdbcUrl, credentialRef)
  return normalizeHierarchy(payload)
}
