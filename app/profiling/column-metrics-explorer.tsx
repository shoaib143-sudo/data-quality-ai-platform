'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'

export type ColumnMetricRow = {
  id: string
  name: string
  type: string
  metricCount: number
  nullRate: number | null
  distinctRate: number | null
  uniqueRate: number | null
  sensitiveRate: number | null
}

type SortKey = 'name' | 'nullRate' | 'distinctRate' | 'uniqueRate' | 'sensitiveRate'
type SortDirection = 'asc' | 'desc'

function percent(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function sortValue(row: ColumnMetricRow, key: SortKey) {
  if (key === 'name') return row.name.toLocaleLowerCase()
  return row[key] ?? -1
}

export function ColumnMetricsExplorer({ rows }: { rows: ColumnMetricRow[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sensitiveOnly, setSensitiveOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return rows
      .filter((row) => !normalized || row.name.toLocaleLowerCase().includes(normalized) || row.type.toLocaleLowerCase().includes(normalized))
      .filter((row) => !sensitiveOnly || (row.sensitiveRate ?? 0) > 0)
      .sort((a, b) => {
        const left = sortValue(a, sortKey)
        const right = sortValue(b, sortKey)
        const result = typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right)
        return sortDirection === 'asc' ? result : -result
      })
  }, [query, rows, sensitiveOnly, sortDirection, sortKey])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection(key === 'name' ? 'asc' : 'desc')
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-45" />
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter columns or types"
            aria-label="Filter profiled columns"
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 pl-9 pr-9 text-sm outline-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear column filter" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-200">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            aria-pressed={sensitiveOnly}
            onClick={() => setSensitiveOnly((value) => !value)}
            className={`dn-control inline-flex h-9 items-center gap-2 px-3 font-semibold ${sensitiveOnly ? 'dn-workspace-accent text-cyan-200' : 'text-slate-300'}`}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Sensitive only
          </button>
          <div className="dn-control inline-flex h-9 items-center gap-2 px-3 text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" /> {visibleRows.length} of {rows.length} columns
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-cyan-300/10 bg-slate-950/30">
        <div className="hidden overflow-x-auto md:block">
          <table className="dn-metric-table w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                {[
                  ['name', 'Column'],
                  ['nullRate', 'Null'],
                  ['distinctRate', 'Distinct'],
                  ['uniqueRate', 'Unique'],
                  ['sensitiveRate', 'Sensitive'],
                ].map(([key, title]) => (
                  <th key={key} scope="col">
                    <button type="button" onClick={() => toggleSort(key as SortKey)} className={`inline-flex items-center gap-1.5 font-semibold ${key === 'name' ? '' : 'ml-auto'}`}>
                      {title}<SortIcon column={key as SortKey} />
                    </button>
                  </th>
                ))}
                <th scope="col">Metrics</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.id === selectedId}
                  tabIndex={0}
                  onClick={() => setSelectedId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedId(row.id)
                    }
                  }}
                  className="cursor-pointer border-t border-cyan-300/10 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/60"
                >
                  <td>
                    <div className="font-semibold text-slate-100">{row.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{row.type}</div>
                  </td>
                  <td className="font-semibold text-slate-200">{percent(row.nullRate)}</td>
                  <td className="font-semibold text-slate-200">{percent(row.distinctRate)}</td>
                  <td className="font-semibold text-slate-200">{percent(row.uniqueRate)}</td>
                  <td className={(row.sensitiveRate ?? 0) > 0 ? 'font-bold text-amber-300' : 'font-semibold text-slate-200'}>{percent(row.sensitiveRate)}</td>
                  <td className="text-xs font-semibold text-slate-400">{row.metricCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 p-2 md:hidden">
          {visibleRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`dn-workspace-inset p-3 text-left ${row.id === selectedId ? 'dn-workspace-accent' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-semibold text-slate-100">{row.name}</div><div className="text-xs text-slate-500">{row.type}</div></div>
                <span className="text-xs text-slate-500">{row.metricCount} metrics</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-500">Null</span><div className="font-semibold">{percent(row.nullRate)}</div></div>
                <div><span className="text-slate-500">Distinct</span><div className="font-semibold">{percent(row.distinctRate)}</div></div>
                <div><span className="text-slate-500">Unique</span><div className="font-semibold">{percent(row.uniqueRate)}</div></div>
                <div><span className="text-slate-500">Sensitive</span><div className={(row.sensitiveRate ?? 0) > 0 ? 'font-bold text-amber-300' : 'font-semibold'}>{percent(row.sensitiveRate)}</div></div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="dn-workspace-inset grid gap-3 p-3 sm:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.7fr))] sm:items-center">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300/70">Selected column</div>
            <div className="mt-1 font-semibold text-slate-100">{selected.name} <span className="font-normal text-slate-500">· {selected.type}</span></div>
          </div>
          {[
            ['Null', selected.nullRate],
            ['Distinct', selected.distinctRate],
            ['Unique', selected.uniqueRate],
            ['Sensitive', selected.sensitiveRate],
          ].map(([label, value]) => (
            <div key={label} className="sm:text-right"><div className="text-[11px] text-slate-500">{label}</div><div className="font-bold text-slate-100">{percent(value as number | null)}</div></div>
          ))}
        </div>
      ) : null}

      {!visibleRows.length ? <div className="dn-workspace-inset p-5 text-center text-sm text-slate-400">No columns match the current filters.</div> : null}
    </div>
  )
}
