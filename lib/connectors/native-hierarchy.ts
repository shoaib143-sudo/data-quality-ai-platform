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
  nativeId?: string | null
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
  excludedNodeIds: string[]
  excludedQualifiedNames: string[]
  includeSystem: boolean
  inheritFutureChildren: boolean
}

const SYSTEM_NAMES = new Set(['information_schema', 'pg_catalog', 'mysql', 'performance_schema', 'sys', 'system'])

export function isSystemNamespace(name: string) {
  const normalized = name.trim().toLowerCase()
  return SYSTEM_NAMES.has(normalized) || normalized.startsWith('pg_toast')
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()))]
    : []
}

export function hierarchySelection(value: unknown): NativeHierarchySelection {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const mode = String(record.mode ?? '').toUpperCase() === 'SELECTED' ? 'SELECTED' : 'ALL'
  return {
    mode,
    nodeIds: strings(record.nodeIds),
    qualifiedNames: strings(record.qualifiedNames),
    excludedNodeIds: strings(record.excludedNodeIds),
    excludedQualifiedNames: strings(record.excludedQualifiedNames),
    includeSystem: record.includeSystem === true,
    inheritFutureChildren: record.inheritFutureChildren !== false,
  }
}

export function nodeExcluded(node: NativeHierarchyNode, selection: NativeHierarchySelection) {
  if (selection.excludedNodeIds.includes(node.id) || selection.excludedQualifiedNames.includes(node.qualifiedName)) return true
  return selection.excludedQualifiedNames.some(excluded => node.qualifiedName.startsWith(`${excluded}.`))
}

export function nodeInSelection(node: NativeHierarchyNode, selection: NativeHierarchySelection) {
  // Deterministic precedence: explicit exclusion always wins. This allows a dynamic
  // parent include (or ALL) to inherit future children while carving out subtrees.
  if (nodeExcluded(node, selection)) return false
  if (node.system && !selection.includeSystem) return false
  if (selection.mode === 'ALL') return true
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
