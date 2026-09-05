export type NativeHierarchyNodeKind = 'ROOT' | 'CATALOG' | 'DATABASE' | 'SCHEMA' | 'OBJECT' | 'FIELD' | 'NAMESPACE'

export type NativeHierarchyNode = {
  id: string
  parentId: string | null
  kind: NativeHierarchyNodeKind
  nativeType: string
  name: string
  qualifiedName: string
  selectable: boolean
  hasChildren: boolean
  catalog?: string | null
  schema?: string | null
  object?: string | null
  objectType?: string | null
  dataType?: string | null
  ordinal?: number | null
  system?: boolean
  metadata?: Record<string, unknown>
}

export type NativeHierarchyTerms = {
  root: string
  catalog: string | null
  schema: string | null
  object: string
  field: string
}

export type NativeHierarchyResult = {
  databaseProduct: string
  databaseVersion: string | null
  terms: NativeHierarchyTerms
  nodes: NativeHierarchyNode[]
  rootIds: string[]
  warnings: string[]
  truncated: boolean
  details: Record<string, unknown>
}

export type NativeHierarchySelection = {
  mode: 'ALL' | 'SELECTED'
  nodeIds: string[]
  qualifiedNames: string[]
}

const SYSTEM_NAMES = new Set(['information_schema', 'pg_catalog', 'mysql', 'performance_schema', 'sys', 'system'])

export function isSystemNamespace(name: string) {
  const normalized = name.trim().toLowerCase()
  return SYSTEM_NAMES.has(normalized) || normalized.startsWith('pg_toast')
}

export function hierarchySelection(value: unknown): NativeHierarchySelection {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const mode = String(record.mode ?? '').toUpperCase() === 'SELECTED' ? 'SELECTED' : 'ALL'
  const nodeIds = Array.isArray(record.nodeIds) ? [...new Set(record.nodeIds.filter((item): item is string => typeof item === 'string' && item.trim()).map(item => item.trim()))] : []
  const qualifiedNames = Array.isArray(record.qualifiedNames) ? [...new Set(record.qualifiedNames.filter((item): item is string => typeof item === 'string' && item.trim()).map(item => item.trim()))] : []
  return { mode, nodeIds, qualifiedNames }
}

export function nodeInSelection(node: NativeHierarchyNode, selection: NativeHierarchySelection) {
  if (selection.mode === 'ALL') return !node.system
  if (selection.nodeIds.includes(node.id) || selection.qualifiedNames.includes(node.qualifiedName)) return true
  return selection.qualifiedNames.some(selected =>
    node.qualifiedName.startsWith(`${selected}.`) || selected.startsWith(`${node.qualifiedName}.`)
  )
}

export function selectedObjectNodes(hierarchy: NativeHierarchyResult, selection: NativeHierarchySelection) {
  return hierarchy.nodes.filter(node => node.kind === 'OBJECT' && nodeInSelection(node, selection))
}

export function selectedFieldNodes(hierarchy: NativeHierarchyResult, selection: NativeHierarchySelection) {
  return hierarchy.nodes.filter(node => node.kind === 'FIELD' && nodeInSelection(node, selection))
}

export function selectedFieldNamesForObject(hierarchy: NativeHierarchyResult, selection: NativeHierarchySelection, objectNode: NativeHierarchyNode) {
  if (selection.mode === 'ALL') return null
  const objectSelectedDirectly = selection.nodeIds.includes(objectNode.id) || selection.qualifiedNames.includes(objectNode.qualifiedName)
  const ancestorSelected = selection.qualifiedNames.some(selected => objectNode.qualifiedName.startsWith(`${selected}.`))
  if (objectSelectedDirectly || ancestorSelected) return null
  const fields = hierarchy.nodes
    .filter(node => node.kind === 'FIELD' && node.parentId === objectNode.id && nodeInSelection(node, selection))
    .map(node => node.name)
  return new Set(fields)
}
