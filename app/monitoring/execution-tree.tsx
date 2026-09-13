'use client'

import { useId, useMemo, useState } from 'react'

import { type Snapshot } from '@/lib/monitoring/execution-contract'
import { buildExecutionPresentation } from './execution-presentation'
import { branchPath, treeLayout } from './execution-tree-layout'

export const STATE_COLORS = {
  running: '#59e7ff',
  complete: '#61f59a',
  waiting: '#ffc75b',
  failed: '#fb7185',
  queued: '#9ab7da',
  cancelled: '#94a3b8',
  skipped: '#94a3b8',
  unknown: '#a8a1bd',
}

const STATE_ICONS: Record<string, string> = {
  running: '◔',
  complete: '✓',
  waiting: '◔',
  failed: '!',
  queued: 'Ⅱ',
  cancelled: '×',
  skipped: '–',
  unknown: '•',
}

const stateLabel = (state: string) => state === 'complete' ? 'Complete' : state.charAt(0).toUpperCase() + state.slice(1)

export function ExecutionTree({
  snapshot,
  selectedId,
  onSelect,
  stale,
  allLinks,
}: {
  snapshot: Snapshot
  selectedId: string
  onSelect: (id: string) => void
  stale: boolean
  allLinks: boolean
}) {
  const [zoom, setZoom] = useState(1)
  const [fitToViewport, setFitToViewport] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const marker = useId().replaceAll(':', '')
  const topology = snapshot.runs.map(run => `${run.id}:${run.parent_run_id}:${run.created_at}`).join('|')

  // Layout is derived only from execution identity and ownership.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => treeLayout(snapshot.runs, snapshot.rootId), [topology, snapshot.rootId])
  const presentation = buildExecutionPresentation(snapshot)
  const stateById = new Map(presentation.nodes.map(node => [node.id, node.state]))
  const byId = new Map(snapshot.runs.map(run => [run.id, run]))
  const root = layout.positions.get(snapshot.rootId)
  if (!root) return null

  const visible = snapshot.runs.filter(run => {
    let parent = run.parent_run_id
    while (parent) {
      if (collapsed.has(parent)) return false
      parent = byId.get(parent)?.parent_run_id ?? null
    }
    return true
  })
  const visibleIds = new Set(visible.map(run => run.id))
  const selectedHasChildren = snapshot.runs.some(run => run.parent_run_id === selectedId)
  const toggleCollapse = () => setCollapsed(current => {
    const next = new Set(current)
    if (next.has(selectedId)) next.delete(selectedId)
    else next.add(selectedId)
    return next
  })

  const trunkState = stateById.get(snapshot.rootId) ?? 'unknown'
  const trunkColor = STATE_COLORS[trunkState]
  const trunkPath = `M ${root.x} ${root.y + 82} C ${root.x - 45} ${root.y + 25} ${root.x + 18} ${root.y - 25} ${root.x} ${root.y}`

  return <div className="living-tree-visual">
    <div className="tree-controls tree-toolbar">
      <button onClick={() => setZoom(value => Math.max(.5, value - .25))} aria-label="Zoom out">−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(value => Math.min(3, value + .25))} aria-label="Zoom in">+</button>
      <button onClick={() => { setZoom(1); setFitToViewport(true) }}>Fit tree</button>
      {selectedHasChildren ? <button onClick={toggleCollapse}>{collapsed.has(selectedId) ? 'Expand selected branch' : 'Collapse selected branch'}</button> : null}
      {collapsed.size ? <button onClick={() => setCollapsed(new Set())}>Expand all</button> : null}
      <span className="tree-subtle">{visible.length} visible runs · scroll to pan</span>
    </div>

    <div className="tree-scroll" aria-label="Execution tree canvas">
      <svg
        role="group"
        aria-label="Living Tree. Solid branches show ownership; dotted arrows show prerequisites."
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ width: `${zoom * 100}%`, minWidth: fitToViewport ? 0 : Math.min(layout.width, 1200) * zoom }}
      >
        <defs>
          <radialGradient id={`${marker}-halo`}>
            <stop stopColor="#0d9ac4" stopOpacity=".28"/>
            <stop offset=".55" stopColor="#063653" stopOpacity=".16"/>
            <stop offset="1" stopColor="#06101d" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id={`${marker}-trunk`} x1="0" x2="1">
            <stop stopColor="#153447"/>
            <stop offset=".52" stopColor={trunkColor} stopOpacity=".58"/>
            <stop offset="1" stopColor="#153447"/>
          </linearGradient>
          <filter id={`${marker}-glow`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id={`${marker}-soft-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <marker id={`${marker}-arrow`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10" fill="#a8b6c8"/>
          </marker>
        </defs>

        <ellipse cx={root.x} cy={root.y - 210} rx="520" ry="470" fill={`url(#${marker}-halo)`}/>

        <g className="tree-ground">
          {[-210, -150, -95, -50, 50, 95, 150, 210].map((dx, index) =>
            <path key={dx} d={`M ${root.x} ${root.y + 62} Q ${root.x + dx * .35} ${root.y + 112} ${root.x + dx} ${root.y + 122 + (index % 2) * 14}`} fill="none" stroke="#24465c" strokeOpacity=".75" strokeWidth={3 + index % 3}/>
          )}
        </g>

        <path d={trunkPath} stroke="#1a3749" strokeWidth="44" fill="none" strokeLinecap="round"/>
        <path d={trunkPath} stroke={`url(#${marker}-trunk)`} strokeWidth="27" fill="none" strokeLinecap="round"/>
        <path d={trunkPath} stroke={trunkColor} strokeOpacity=".55" strokeWidth="4" fill="none" strokeLinecap="round" filter={`url(#${marker}-soft-glow)`}/>
        {trunkState === 'running' && !stale
          ? <path className="tree-pulse" d={trunkPath} pathLength="100" fill="none" stroke={STATE_COLORS.running} strokeWidth="6" strokeDasharray="2 19" filter={`url(#${marker}-glow)`}/>
          : null}

        {visible.filter(run => run.id !== snapshot.rootId).map(run => {
          const parent = layout.positions.get(run.parent_run_id ?? '')
          const point = layout.positions.get(run.id)
          if (!parent || !point) return null
          const state = stateById.get(run.id) ?? 'unknown'
          const color = STATE_COLORS[state]
          const path = branchPath(parent, point)
          const thickness = Math.max(10, 28 - point.depth * 4)

          return <g key={run.id}>
            <path d={path} fill="none" stroke="#182f41" strokeWidth={thickness + 10} strokeLinecap="round"/>
            <path d={path} fill="none" stroke="#31516a" strokeWidth={thickness} strokeLinecap="round" strokeOpacity=".9"/>
            <path d={path} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeOpacity=".58" filter={`url(#${marker}-soft-glow)`}/>
            <path d={path} fill="none" stroke="#d8f8ff" strokeWidth="1.3" strokeLinecap="round" strokeOpacity=".22" transform="translate(6 0)"/>
            {state === 'running' && !stale
              ? <path className="tree-pulse" d={path} pathLength="100" fill="none" stroke={color} strokeWidth="6" strokeDasharray="2 18" filter={`url(#${marker}-glow)`}/>
              : null}

            {[-1, 1].map((side, leafIndex) => {
              const stemX = point.x + side * (34 + point.depth * 5)
              const stemY = point.y + 45 + leafIndex * 10
              const leafX = point.x + side * (65 + point.depth * 7)
              const leafY = point.y + 12 + leafIndex * 22
              return <g key={side}>
                <path d={`M${point.x} ${point.y + 70} Q${stemX} ${stemY} ${leafX} ${leafY}`} fill="none" stroke={color} strokeOpacity=".45" strokeWidth="2"/>
                <path d={`M${leafX} ${leafY} q${side * 28} -18 ${side * 42} 6 q${side * -22} 24 ${side * -42} -6`} fill={color} fillOpacity=".18" stroke={color} strokeOpacity=".55"/>
                <path d={`M${leafX} ${leafY} l${side * 27} 3`} stroke={color} strokeOpacity=".5"/>
              </g>
            })}
          </g>
        })}

        {snapshot.steps.filter(step => step.agent_run_id === selectedId && visibleIds.has(selectedId)).slice(0, 3).map((step, index) => {
          const point = layout.positions.get(selectedId)
          if (!point) return null
          const x = point.x + (index - 1) * 72
          const y = point.y + 106 + (index % 2) * 22
          const color = step.status === 'SUCCEEDED' ? STATE_COLORS.complete : step.status === 'RUNNING' ? STATE_COLORS.running : step.status === 'FAILED' ? STATE_COLORS.failed : STATE_COLORS.queued
          return <g key={step.id}>
            <path d={`M${point.x} ${point.y + 25} Q${point.x} ${y - 18} ${x} ${y}`} stroke={color} strokeWidth="1.6" strokeOpacity=".68" fill="none"/>
            <ellipse cx={x} cy={y} rx="9" ry="17" transform={`rotate(35 ${x} ${y})`} fill={color} fillOpacity=".24" stroke={color} filter={`url(#${marker}-soft-glow)`}/>
            <title>{step.step_name}: {step.status}; attempt {step.attempt}</title>
          </g>
        })}

        {presentation.prerequisites.filter(edge => allLinks || edge.source === selectedId || edge.target === selectedId).map(edge => {
          const source = layout.positions.get(edge.source)
          const target = layout.positions.get(edge.target)
          if (!source || !target || !visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return null
          const labelX = (source.x + target.x) / 2
          const labelY = Math.min(source.y, target.y) - 95
          const stroke = edge.satisfied ? '#6f8299' : '#f7b94c'
          return <g key={edge.id}>
            <path
              d={`M${source.x + 12} ${source.y - 25} Q${labelX} ${labelY - 35} ${target.x - 10} ${target.y - 28}`}
              fill="none"
              stroke={stroke}
              strokeWidth="2.5"
              strokeDasharray="3 8"
              markerEnd={`url(#${marker}-arrow)`}
              opacity={edge.satisfied ? .58 : .92}
            />
            {!edge.satisfied
              ? <text x={labelX} y={labelY} textAnchor="middle" fill="#ffc75b" fontSize="11" letterSpacing=".4">WAITS FOR PREREQUISITE</text>
              : null}
            <title>{edge.condition === 'SUCCESS' ? 'Requires successful completion' : 'Requires terminal completion'}; {edge.satisfied ? 'satisfied' : 'waiting'}</title>
          </g>
        })}

        {visible.map(run => {
          const point = layout.positions.get(run.id)
          if (!point) return null
          const state = stateById.get(run.id) ?? 'unknown'
          const color = STATE_COLORS[state]
          const icon = STATE_ICONS[state] ?? '•'
          const isRoot = run.id === snapshot.rootId
          const selected = selectedId === run.id
          const width = isRoot ? 174 : 152
          const pillY = isRoot ? point.y - 3 : point.y - 32

          return <g
            key={run.id}
            role="button"
            tabIndex={0}
            aria-label={`${run.name ?? 'Agent'}: ${state}`}
            aria-pressed={selected}
            className="tree-node"
            onClick={() => onSelect(run.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(run.id)
              }
            }}
          >
            <rect x={point.x - 108} y={point.y - 78} width="216" height="105" rx="16" fill="transparent" stroke={selected ? color : 'transparent'} strokeOpacity={selected ? .42 : 0} strokeWidth="1.5"/>
            {!isRoot
              ? <text x={point.x} y={point.y - 59} textAnchor="middle" fill="#f1f6ff" fontSize="18" fontFamily="Georgia, serif">{(run.name ?? 'Agent').slice(0, 24)}</text>
              : null}
            <rect x={point.x - width / 2} y={pillY} width={width} height="36" rx="18" fill="#0b2031" stroke={color} strokeWidth={selected ? 2 : 1.2} filter={selected ? `url(#${marker}-soft-glow)` : undefined}/>
            <circle cx={point.x - width / 2 + 20} cy={pillY + 18} r="10" fill={color} fillOpacity=".18" stroke={color}/>
            <text x={point.x - width / 2 + 20} y={pillY + 22} textAnchor="middle" fill={color} fontSize="13" fontWeight="700">{icon}</text>
            <text x={point.x + 10} y={pillY + 23} textAnchor="middle" fill={isRoot ? '#d8f8ff' : color} fontSize={isRoot ? 14 : 13} fontWeight="600">{isRoot ? (run.name ?? 'Supervisor run').slice(0, 22) : stateLabel(state)}</text>
            {collapsed.has(run.id) ? <text x={point.x} y={pillY + 54} textAnchor="middle" fill="#9fb1c7" fontSize="10">Branches collapsed</text> : null}
            <title>{run.name} · {run.id} · {run.status}</title>
          </g>
        })}
      </svg>
    </div>
    {snapshot.steps.filter(step => step.agent_run_id === selectedId).length > 3
      ? <p className="tree-subtle tree-toolbar">First 3 execution-step leaves shown. Full recorded evidence is available in the selected-job panel.</p>
      : null}
  </div>
}
