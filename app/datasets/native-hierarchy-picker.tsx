'use client'

import { useMemo } from 'react'
import type { NativeHierarchyNode, NativeHierarchyResult } from '@/lib/connectors/native-hierarchy'

type Props = {
  hierarchy: NativeHierarchyResult
  mode: 'ALL' | 'SELECTED'
  selectedNodeIds: string[]
  disabled?: boolean
  onModeChange: (mode: 'ALL' | 'SELECTED') => void
  onSelectionChange: (nodeIds: string[]) => void
}

function nodeLabel(node: NativeHierarchyNode) {
  if (node.kind === 'FIELD' && node.dataType) return `${node.name} · ${node.dataType}`
  if (node.kind === 'OBJECT' && node.objectType) return `${node.name} · ${node.objectType}`
  return node.name
}

export function NativeHierarchyPicker({ hierarchy, mode, selectedNodeIds, disabled, onModeChange, onSelectionChange }: Props) {
  const byId = useMemo(() => new Map(hierarchy.nodes.map(node => [node.id, node])), [hierarchy.nodes])
  const children = useMemo(() => {
    const result = new Map<string | null, NativeHierarchyNode[]>()
    for (const node of hierarchy.nodes) {
      const list = result.get(node.parentId) ?? []
      list.push(node)
      result.set(node.parentId, list)
    }
    for (const list of result.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [hierarchy.nodes])
  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])

  function ancestorSelected(node: NativeHierarchyNode) {
    let parentId = node.parentId
    while (parentId) {
      if (selected.has(parentId)) return true
      parentId = byId.get(parentId)?.parentId ?? null
    }
    return false
  }

  function descendantIds(nodeId: string) {
    const result: string[] = []
    const queue = [...(children.get(nodeId) ?? [])]
    while (queue.length) {
      const node = queue.shift()!
      result.push(node.id)
      queue.push(...(children.get(node.id) ?? []))
    }
    return result
  }

  function toggle(node: NativeHierarchyNode, checked: boolean) {
    const next = new Set(selectedNodeIds)
    if (checked) {
      for (const id of descendantIds(node.id)) next.delete(id)
      next.add(node.id)
    } else {
      next.delete(node.id)
    }
    onSelectionChange([...next])
  }

  function renderNode(node: NativeHierarchyNode, depth: number): React.ReactNode {
    const descendantsCovered = ancestorSelected(node)
    const checked = selected.has(node.id) || descendantsCovered
    const childNodes = children.get(node.id) ?? []
    return <div key={node.id}>
      <div className="flex min-w-0 items-center gap-2 border-b border-slate-100 py-1.5 pr-2 text-xs" style={{ paddingLeft: `${Math.min(depth, 8) * 18 + 8}px` }}>
        {node.selectable && mode === 'SELECTED'
          ? <input type="checkbox" checked={checked} disabled={disabled || descendantsCovered} onChange={event => toggle(node, event.target.checked)} />
          : <span className="inline-block h-3 w-3" />}
        <span className="min-w-0 flex-1 truncate" title={node.qualifiedName}>{nodeLabel(node)}</span>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{node.nativeType}</span>
        {node.system && <span className="shrink-0 text-[10px] text-amber-700">system</span>}
      </div>
      {childNodes.map(child => renderNode(child, depth + 1))}
    </div>
  }

  const roots = hierarchy.rootIds.map(id => byId.get(id)).filter((node): node is NativeHierarchyNode => Boolean(node))
  const selectedNames = selectedNodeIds.map(id => byId.get(id)?.qualifiedName).filter((value): value is string => Boolean(value))

  return <fieldset disabled={disabled} className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
    <legend className="px-1 text-sm font-semibold">Native source hierarchy</legend>
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'ALL'} onChange={() => onModeChange('ALL')} />All accessible non-system data</label>
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'SELECTED'} onChange={() => onModeChange('SELECTED')} />Select from hierarchy</label>
    </div>
    <p className="mt-2 text-xs text-slate-500">
      DataNexus is showing the hierarchy reported by {hierarchy.databaseProduct}. Select any combination of native catalogs/databases, schemas, objects, or fields. Selecting a parent includes its descendants.
    </p>
    <div className="mt-3 max-h-[34rem] overflow-auto rounded-lg border border-slate-200 bg-slate-50/40">
      {roots.map(root => renderNode(root, 0))}
    </div>
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
      <span>{hierarchy.nodes.length} hierarchy nodes</span>
      <span>{hierarchy.nodes.filter(node => node.kind === 'OBJECT').length} objects</span>
      <span>{hierarchy.nodes.filter(node => node.kind === 'FIELD').length} fields</span>
      {mode === 'SELECTED' && <span>{selectedNames.length} selections</span>}
      {hierarchy.truncated && <span className="font-medium text-amber-700">Hierarchy truncated by connector safety ceiling</span>}
    </div>
    {hierarchy.warnings.length > 0 && <div className="mt-2 text-xs text-amber-700">{hierarchy.warnings.slice(0, 3).join(' ')}</div>}
  </fieldset>
}
