'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(hierarchy.rootIds))
  const [query, setQuery] = useState('')
  const [showSystem, setShowSystem] = useState(false)
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
  const normalizedQuery = query.trim().toLocaleLowerCase()

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
    } else next.delete(node.id)
    onSelectionChange([...next])
  }

  function toggleExpanded(nodeId: string) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  function matches(node: NativeHierarchyNode): boolean {
    if (!showSystem && node.system) return false
    if (!normalizedQuery) return true
    const ownText = `${node.name} ${node.qualifiedName} ${node.nativeType} ${node.objectType ?? ''} ${node.dataType ?? ''}`.toLocaleLowerCase()
    if (ownText.includes(normalizedQuery)) return true
    return (children.get(node.id) ?? []).some(matches)
  }

  function renderNode(node: NativeHierarchyNode, depth: number): ReactNode {
    if (!matches(node)) return null
    const descendantsCovered = ancestorSelected(node)
    const checked = selected.has(node.id) || descendantsCovered
    const childNodes = (children.get(node.id) ?? []).filter(matches)
    const hasChildren = childNodes.length > 0
    const open = normalizedQuery ? hasChildren : expanded.has(node.id)
    return <div key={node.id}>
      <div className="flex min-w-max items-center gap-2 border-b border-slate-100 py-2 pr-3 text-sm hover:bg-slate-50" style={{ paddingLeft: `${Math.min(depth, 10) * 20 + 8}px` }}>
        {hasChildren ? <button type="button" disabled={disabled} onClick={() => toggleExpanded(node.id)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-slate-200" aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button> : <span className="h-5 w-5 shrink-0" />}
        {node.selectable && mode === 'SELECTED'
          ? <input type="checkbox" checked={checked} disabled={disabled || descendantsCovered} onChange={event => toggle(node, event.target.checked)} className="h-4 w-4 shrink-0" />
          : <span className="inline-block h-4 w-4 shrink-0" />}
        <span className="whitespace-nowrap font-medium text-slate-800" title={node.qualifiedName}>{nodeLabel(node)}</span>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{node.nativeType}</span>
        {node.system && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">system</span>}
      </div>
      {open && childNodes.map(child => renderNode(child, depth + 1))}
    </div>
  }

  const roots = hierarchy.rootIds.map(id => byId.get(id)).filter((node): node is NativeHierarchyNode => Boolean(node)).filter(matches)
  const selectedNames = selectedNodeIds.map(id => byId.get(id)?.qualifiedName).filter((value): value is string => Boolean(value))
  const systemCount = hierarchy.nodes.filter(node => node.system).length

  return <fieldset disabled={disabled} className="md:col-span-2 min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <legend className="px-1 text-sm font-semibold">Native source hierarchy</legend>
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'ALL'} onChange={() => onModeChange('ALL')} />All accessible non-system data</label>
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'SELECTED'} onChange={() => onModeChange('SELECTED')} />Select from hierarchy</label>
    </div>
    <p className="mt-2 text-xs text-slate-500">DataNexus is showing the hierarchy reported by {hierarchy.databaseProduct}. Expand only the catalogs, schemas, objects, or fields you need. Selecting a parent includes its descendants.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search catalog, schema, table, view, or field…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </label>
      {systemCount > 0 && <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showSystem} onChange={event => setShowSystem(event.target.checked)} />Show system objects ({systemCount})</label>}
    </div>
    <div className="mt-3 max-h-[42rem] w-full overflow-auto rounded-lg border border-slate-200 bg-white">
      <div className="min-w-full w-max">{roots.length ? roots.map(root => renderNode(root, 0)) : <div className="p-6 text-center text-sm text-slate-500">No hierarchy nodes match this search.</div>}</div>
    </div>
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
      <span>{hierarchy.nodes.length} hierarchy nodes</span><span>{hierarchy.nodes.filter(node => node.kind === 'OBJECT').length} objects</span><span>{hierarchy.nodes.filter(node => node.kind === 'FIELD').length} fields</span>
      {mode === 'SELECTED' && <span>{selectedNames.length} selections</span>}
      {hierarchy.truncated && <span className="font-medium text-amber-700">Hierarchy truncated by connector safety ceiling</span>}
    </div>
    {hierarchy.warnings.length > 0 && <div className="mt-2 text-xs text-amber-700">{hierarchy.warnings.slice(0, 3).join(' ')}</div>}
  </fieldset>
}
