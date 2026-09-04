import { createHash } from 'node:crypto'
import type { ProjectionEvent } from '@/lib/data-plane/contracts'
import { getOpenSearchConnection, openSearchRequest } from '@/lib/data-plane/providers/opensearch-http'

type KnowledgeDocument = {
  objectType?: string
  objectId?: string
  label?: string
  description?: string | null
  content?: string | null
  href?: string | null
  metadata?: Record<string, unknown>
  updatedAt?: string | null
}

type BulkItem = Record<string, { status?: number; error?: unknown }>
type BulkResponse = { errors?: boolean; items?: BulkItem[] }

function knowledgeDocument(event: ProjectionEvent): KnowledgeDocument | null {
  const value = event.payload?.knowledgeDocument
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as KnowledgeDocument
}

function documentIdentity(event: ProjectionEvent, doc: KnowledgeDocument) {
  const objectType = (doc.objectType ?? event.aggregateType).trim()
  const objectId = (doc.objectId ?? event.aggregateId).trim()
  if (!objectType || !objectId) throw new Error('Knowledge projection requires objectType and objectId')
  return { objectType, objectId }
}

function documentId(projectId: string, objectType: string, objectId: string) {
  return createHash('sha256').update(`${projectId}\u0000${objectType}\u0000${objectId}`).digest('hex')
}

function facetValue(value: unknown) {
  if (value === null) return '__NULL__'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function facets(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .filter(([key]) => /^[A-Za-z0-9_.-]{1,100}$/.test(key))
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value]
      return values
        .map((item) => facetValue(item))
        .filter((item) => item.length <= 1024)
        .map((value) => ({ key, value }))
    })
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function bulkLines(events: ProjectionEvent[], index: string) {
  const lines: string[] = []
  let operations = 0

  for (const event of events) {
    const doc = knowledgeDocument(event)
    if (!doc) continue
    const { objectType, objectId } = documentIdentity(event, doc)
    const _id = documentId(event.projectId, objectType, objectId)

    if (event.operation === 'DELETE') {
      lines.push(JSON.stringify({ delete: { _index: index, _id } }))
      operations += 1
      continue
    }

    const metadata = doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? doc.metadata
      : {}
    const label = safeText(doc.label).trim()
    if (!label) throw new Error(`Knowledge projection ${objectType}:${objectId} requires a label`)

    lines.push(JSON.stringify({ index: { _index: index, _id } }))
    lines.push(JSON.stringify({
      projectId: event.projectId,
      objectType,
      objectId,
      label,
      description: typeof doc.description === 'string' ? doc.description : null,
      content: typeof doc.content === 'string' ? doc.content : '',
      href: typeof doc.href === 'string' ? doc.href : null,
      metadata,
      facets: facets(metadata),
      updatedAt: doc.updatedAt ?? event.occurredAt,
    }))
    operations += 1
  }

  return { body: lines.length ? `${lines.join('\n')}\n` : '', operations }
}

export class OpenSearchKnowledgeProjectionSink {
  readonly providerKey = 'opensearch'

  async apply(events: ProjectionEvent[]) {
    const { knowledgeIndex } = getOpenSearchConnection()
    const { body, operations } = bulkLines(events, knowledgeIndex)
    if (!operations) return { operations: 0 }

    const response = await openSearchRequest('/_bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`OpenSearch knowledge projection failed (${response.status}): ${text.slice(0, 2000) || response.statusText}`)
    }

    const payload = text ? JSON.parse(text) as BulkResponse : {}
    if (payload.errors) {
      const failures = (payload.items ?? []).flatMap((item) => Object.values(item))
        .filter((result) => (result.status ?? 500) >= 300 && result.status !== 404)
        .slice(0, 10)
      if (failures.length) {
        throw new Error(`OpenSearch knowledge projection contained ${failures.length} failed bulk operations: ${JSON.stringify(failures).slice(0, 3000)}`)
      }
    }

    return { operations }
  }
}
